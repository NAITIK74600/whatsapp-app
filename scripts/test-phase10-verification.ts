import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { prisma } from "../src/lib/prisma";
import { waManager } from "../src/modules/whatsapp/manager";
import { canAccessSession, isSessionOwner } from "../src/lib/api-auth";
import QRCode from "qrcode";

async function runVerificationTests() {
    console.log("================================================================================");
    console.log("🚀 STARTING PHASE 10: AUTOMATED TESTING & VERIFICATION SUITE");
    console.log("================================================================================\n");

    let passed = 0;
    let failed = 0;

    const assert = (condition: boolean, testName: string, detail?: string) => {
        if (condition) {
            console.log(`✅ [PASS] ${testName}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${testName}: ${detail || "Condition not met"}`);
            failed++;
        }
    };

    // Setup: Get or create test user
    let userA = await prisma.user.findFirst({ where: { email: "igxnaitik@gmail.com" } });
    if (!userA) {
        userA = await prisma.user.create({
            data: {
                email: "test_user_a@example.com",
                name: "Test User A",
                password: "hashpassword123",
                role: "OWNER"
            }
        });
    }

    let userB = await prisma.user.findFirst({ where: { email: "test_user_b@example.com" } });
    if (!userB) {
        userB = await prisma.user.create({
            data: {
                email: "test_user_b@example.com",
                name: "Test User B",
                password: "hashpassword123",
                role: "OWNER"
            }
        });
    }

    const testSessionSlug = `test_verif_${Date.now()}`;
    const testSessionName = "Automated Test Session";

    try {
        // TEST 1: Session creation with valid input
        console.log("\n--- TEST 1: Session Creation (Valid Input) ---");
        const session = await waManager.createSession(userA.id, testSessionName, testSessionSlug);
        assert(!!session && session.sessionId === testSessionSlug, "Session created successfully in DB", `Session ID: ${session?.sessionId}`);
        assert(session.status === "CONNECTING", "Initial session status is CONNECTING", `Status: ${session.status}`);

        // TEST 2: Active instance in memory
        console.log("\n--- TEST 2: Active WhatsApp Instance in Memory ---");
        const instance = waManager.getInstance(testSessionSlug);
        assert(!!instance, "WhatsAppInstance is registered in memory manager", `Instance found: ${!!instance}`);
        assert(instance?.sessionId === testSessionSlug, "Instance sessionId matches", `Instance ID: ${instance?.sessionId}`);

        // TEST 3: Duplicate session ID prevention
        console.log("\n--- TEST 3: Duplicate Session Prevention ---");
        let duplicateIdError = false;
        try {
            await waManager.createSession(userA.id, "Another Name", testSessionSlug);
        } catch (e: any) {
            duplicateIdError = true;
            assert(e.message.includes("already exists"), "Duplicate session ID rejected with descriptive error", e.message);
        }
        assert(duplicateIdError, "Duplicate session ID prevented");

        // TEST 4: Duplicate session name prevention for same user
        let duplicateNameError = false;
        try {
            await waManager.createSession(userA.id, testSessionName);
        } catch (e: any) {
            duplicateNameError = true;
            assert(e.message.includes("already have an active session"), "Duplicate session name for user rejected with descriptive error", e.message);
        }
        assert(duplicateNameError, "Duplicate session name prevented");

        // TEST 5: Session creation with invalid input
        console.log("\n--- TEST 5: Invalid Input Validation ---");
        let emptyNameError = false;
        try {
            await waManager.createSession(userA.id, "   ");
        } catch (e: any) {
            emptyNameError = true;
        }
        assert(emptyNameError, "Empty or whitespace-only session name rejected");

        let shortNameError = false;
        try {
            await waManager.createSession(userA.id, "a");
        } catch (e: any) {
            shortNameError = true;
        }
        assert(shortNameError, "Single character session name rejected");

        // TEST 6: Database Persistence & Relationships
        console.log("\n--- TEST 6: Database Persistence & Relations ---");
        const dbRecord = await prisma.session.findUnique({
            where: { sessionId: testSessionSlug },
            include: { botConfig: true, user: true }
        });
        assert(!!dbRecord, "Session record persisted in MySQL database");
        assert(!!dbRecord?.botConfig, "Default botConfig automatically created for session");
        assert(dbRecord?.userId === userA.id, "Session correctly assigned to user ownership");

        // TEST 7: Instance Lookup by CUID and by slug
        console.log("\n--- TEST 7: Dual Lookup (CUID & Slug) ---");
        const bySlug = waManager.getInstance(testSessionSlug);
        const byCuid = waManager.getInstance(session.id);
        assert(!!bySlug, "Instance found by slug");
        assert(!!byCuid, "Instance found by database CUID");

        // TEST 8: QR Code simulation and delivery
        console.log("\n--- TEST 8: QR Code Generation & Retrieval Simulation ---");
        // Simulate a QR event on instance
        const simulatedQr = "2@1234567890abcdef,simulated_qr_secret_data==";
        instance!.qr = simulatedQr;
        instance!.status = "SCAN_QR";
        await prisma.session.update({
            where: { sessionId: testSessionSlug },
            data: { qr: simulatedQr, status: "SCAN_QR" }
        });

        const base64QR = await QRCode.toDataURL(simulatedQr);
        assert(base64QR.startsWith("data:image/png;base64,"), "Valid base64 QR code image generated from string");

        const updatedDb = await prisma.session.findUnique({ where: { sessionId: testSessionSlug } });
        assert(updatedDb?.qr === simulatedQr, "QR string successfully stored in database");
        assert(updatedDb?.status === "SCAN_QR", "Session status updated to SCAN_QR");

        // TEST 9: Multi-Tenant Security & Isolation
        console.log("\n--- TEST 9: Multi-Tenant Security & Isolation ---");
        const userACanAccess = await canAccessSession(userA.id, "OWNER", testSessionSlug);
        const userBCanAccess = await canAccessSession(userB.id, "OWNER", testSessionSlug);
        assert(userACanAccess === true, "Owner (User A) HAS access to own session");
        assert(userBCanAccess === false, "Non-owner (User B) is BLOCKED from accessing User A's session");

        const userAIsOwner = await isSessionOwner(userA.id, "OWNER", testSessionSlug);
        const userBIsOwner = await isSessionOwner(userB.id, "OWNER", testSessionSlug);
        assert(userAIsOwner === true, "Owner (User A) is correctly verified as owner");
        assert(userBIsOwner === false, "Non-owner (User B) is NOT permitted to delete or manage access");

        // TEST 10: Reconnection / Restart
        console.log("\n--- TEST 10: Reconnection & Restart Behavior ---");
        await waManager.restartSession(testSessionSlug);
        const restartedInstance = waManager.getInstance(testSessionSlug);
        assert(!!restartedInstance, "Instance successfully restarted and present in memory");

        // TEST 11: Deletion and Cleanup
        console.log("\n--- TEST 11: Permanent Deletion & Credential Cleanup ---");
        // Create a dummy authState to verify cleanup
        await prisma.authState.upsert({
            where: { sessionId_key: { sessionId: testSessionSlug, key: "creds-test" } },
            create: { sessionId: testSessionSlug, key: "creds-test", value: { test: true } },
            update: {}
        });

        await waManager.deleteSession(testSessionSlug);

        const checkSession = await prisma.session.findUnique({ where: { sessionId: testSessionSlug } });
        const checkAuth = await prisma.authState.findMany({ where: { sessionId: testSessionSlug } });
        const checkInstance = waManager.getInstance(testSessionSlug);

        assert(checkSession === null, "Session record deleted from MySQL database");
        assert(checkAuth.length === 0, "All associated AuthState credentials deleted from MySQL");
        assert(checkInstance === undefined, "Session removed from memory manager");

    } catch (err: any) {
        console.error("Test execution caught unhandled error:", err);
        failed++;
    } finally {
        // Cleanup User B if created
        await prisma.user.deleteMany({ where: { email: "test_user_b@example.com" } }).catch(() => {});
        await prisma.$disconnect();
    }

    console.log("\n================================================================================");
    console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
    console.log("================================================================================");

    process.exit(failed > 0 ? 1 : 0);
}

runVerificationTests();
