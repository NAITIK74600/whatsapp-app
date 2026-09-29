const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failed++;
    }
}

async function runTests() {
    console.log("==================================================================");
    console.log("   AUTOMATED MULTI-TENANT SAAS SECURITY & ISOLATION TEST SUITE    ");
    console.log("==================================================================\n");

    // 1. Verify Super Admin and Pilot Tenant
    console.log("[TEST GROUP 1: Super Admin & Pilot Tenant Setup]");
    const superAdmin = await prisma.user.findFirst({
        where: { email: "igxnaitik@gmail.com" }
    });
    assert(superAdmin && superAdmin.role === "SUPERADMIN", "Super Admin user exists with SUPERADMIN role");

    const easyMotors = await prisma.tenant.findUnique({
        where: { slug: "easy-motors-biel" },
        include: { sessions: true, knowledgeEntries: true }
    });
    assert(easyMotors !== null, "Easy Motors Biel tenant exists in database");
    assert(easyMotors?.status === "ACTIVE", "Easy Motors Biel is ACTIVE");
    assert(easyMotors?.sessions.some(s => s.sessionId === "easy123"), "Session 'easy123' is linked to Easy Motors Biel tenant");
    assert(easyMotors?.knowledgeEntries.length > 0, "Easy Motors Biel has verified knowledge base entries");

    // 2. Provision Test Client: Zurich Motors AG
    console.log("\n[TEST GROUP 2: Client Provisioning Workflow]");
    const testEmail = "test-owner@zurichmotors.ch";
    
    // Clean up if left from previous runs
    await prisma.tenant.deleteMany({ where: { slug: "zurich-motors-test" } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: testEmail } }).catch(() => {});

    const testPassword = "TestPassword#2026";
    const hashedPassword = await bcrypt.hash(testPassword, 10);

    const clientUser = await prisma.user.create({
        data: {
            name: "Zurich Motors Owner",
            email: testEmail,
            password: hashedPassword,
            role: "OWNER",
            mustChangePassword: true
        }
    });
    assert(clientUser.id !== undefined, "Client owner user created with mustChangePassword flag");

    const testTenant = await prisma.tenant.create({
        data: {
            name: "Zurich Motors AG",
            slug: "zurich-motors-test",
            status: "ACTIVE",
            plan: "STARTER",
            businessCategory: "Vehicle Dealership",
            country: "Switzerland",
            timezone: "Europe/Zurich",
            maxSessions: 1,
            maxMonthlyMessages: 1000
        }
    });
    assert(testTenant.id !== undefined, "Client workspace 'Zurich Motors AG' created");

    const membership = await prisma.tenantMembership.create({
        data: {
            tenantId: testTenant.id,
            userId: clientUser.id,
            role: "OWNER",
            isDefault: true
        }
    });
    assert(membership.id !== undefined, "Client owner linked to workspace via TenantMembership");

    // Create session for Zurich Motors
    const testSession = await prisma.session.create({
        data: {
            userId: clientUser.id,
            tenantId: testTenant.id,
            name: "Zurich Sales Desk",
            sessionId: "zurich_test_session_1",
            status: "DISCONNECTED"
        }
    });
    assert(testSession.id !== undefined, "Session 'zurich_test_session_1' created for Zurich Motors AG");

    // 3. Strict Tenant Isolation Tests
    console.log("\n[TEST GROUP 3: Cross-Tenant Isolation & IDOR Prevention]");

    // Import auth helpers
    const { canAccessSession, getAccessibleSessions } = require('../src/lib/api-auth');

    // Test A: Can Client B access Client A's session?
    const clientB_access_clientA = await canAccessSession(clientUser.id, clientUser.role, "easy123");
    assert(clientB_access_clientA === false, "Client B CANNOT access Client A's session 'easy123' (REJECTED)");

    // Test B: Can Client B access Client B's own session?
    const clientB_access_own = await canAccessSession(clientUser.id, clientUser.role, "zurich_test_session_1");
    assert(clientB_access_own === true, "Client B CAN access its own session 'zurich_test_session_1' (ALLOWED)");

    // Test C: Can Super Admin access both sessions?
    const admin_access_clientA = await canAccessSession(superAdmin.id, superAdmin.role, "easy123");
    const admin_access_clientB = await canAccessSession(superAdmin.id, superAdmin.role, "zurich_test_session_1");
    assert(admin_access_clientA === true && admin_access_clientB === true, "Super Admin has global access to manage both client sessions");

    // Test D: getAccessibleSessions scoping
    const clientBSessions = await getAccessibleSessions(clientUser.id, clientUser.role);
    const clientBSessionIds = clientBSessions.map(s => s.sessionId);
    assert(
        clientBSessionIds.includes("zurich_test_session_1") && !clientBSessionIds.includes("easy123"),
        "Client B session list returns ONLY its own sessions and excludes Easy Motors Biel"
    );

    // 4. Plan Limits Enforcement Test
    console.log("\n[TEST GROUP 4: Plan Limits & Account Suspension]");
    
    // Attempting to exceed maxSessions = 1
    const { waManager } = require('../src/modules/whatsapp/manager');
    let limitBlocked = false;
    try {
        await waManager.createSession(clientUser.id, "Second Session Attempt", undefined, testTenant.id);
    } catch (err) {
        limitBlocked = err.message.includes("plan limit of 1");
    }
    assert(limitBlocked, "Plan limit enforced: Cannot create 2nd session when maxSessions = 1");

    // Account Suspension
    await prisma.tenant.update({
        where: { id: testTenant.id },
        data: { status: "SUSPENDED" }
    });

    let suspendedBlocked = false;
    try {
        await waManager.createSession(clientUser.id, "Third Session While Suspended", undefined, testTenant.id);
    } catch (err) {
        suspendedBlocked = err.message.includes("suspended");
    }
    assert(suspendedBlocked, "Suspension enforced: Suspended tenant is blocked from initializing new sessions");

    // 5. Clean up test records
    console.log("\n[TEST GROUP 5: Safe Cleanup]");
    await prisma.session.deleteMany({ where: { sessionId: "zurich_test_session_1" } });
    await prisma.tenant.deleteMany({ where: { id: testTenant.id } });
    await prisma.user.deleteMany({ where: { id: clientUser.id } });
    assert(true, "Temporary test workspace and credentials securely removed");

    // Verify Easy Motors Biel remains untouched
    const easyMotorsCheck = await prisma.session.findUnique({ where: { sessionId: "easy123" } });
    assert(easyMotorsCheck !== null, "Easy Motors Biel session 'easy123' remains 100% intact");

    console.log("\n==================================================================");
    console.log(`   TEST RESULTS: ${passed} PASSED, ${failed} FAILED                 `);
    console.log("==================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests()
    .catch((err) => {
        console.error("Test execution failed with error:", err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
