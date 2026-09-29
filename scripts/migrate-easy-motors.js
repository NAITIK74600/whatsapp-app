const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Starting migration to link existing Easy Motors Biel data to Multi-Tenant model...");

  const admin = await prisma.user.findFirst({
    where: { email: "igxnaitik@gmail.com" }
  });

  if (!admin) {
    console.error("Super Admin user 'igxnaitik@gmail.com' not found!");
    return;
  }

  // Find or create Easy Motors Biel tenant
  let tenant = await prisma.tenant.findUnique({
    where: { slug: "easy-motors-biel" }
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Easy Motors Biel",
        slug: "easy-motors-biel",
        status: "ACTIVE",
        plan: "BUSINESS",
        businessCategory: "Vehicle Dealership",
        country: "Switzerland",
        timezone: "Europe/Zurich",
        preferredLanguage: "de",
        phone: "+41 32 322 00 00",
        email: "info@easymotors-biel.ch",
        website: "https://easymotors.ch",
        description: "Official dealership and garage for quality vehicles in Biel/Bienne.",
        businessHours: {
          monday: { open: "08:00", close: "18:30" },
          tuesday: { open: "08:00", close: "18:30" },
          wednesday: { open: "08:00", close: "18:30" },
          thursday: { open: "08:00", close: "18:30" },
          friday: { open: "08:00", close: "18:30" },
          saturday: { open: "09:00", close: "16:00" },
          sunday: { closed: true }
        },
        maxSessions: 3,
        maxEmployees: 10,
        maxMonthlyMessages: 10000,
        maxContacts: 10000,
        maxAutoReplies: 50,
        aiTokenLimit: 500000,
        onboardingCompleted: true,
        notes: "Pilot client - Easy Motors Biel"
      }
    });
    console.log("Created Tenant:", tenant.name, `(${tenant.id})`);
  } else {
    console.log("Existing Tenant found:", tenant.name, `(${tenant.id})`);
  }

  // Ensure membership exists
  const existingMembership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: admin.id
      }
    }
  });

  if (!existingMembership) {
    await prisma.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId: admin.id,
        role: "OWNER",
        isDefault: true
      }
    });
    console.log("Created TenantMembership for", admin.email);
  }

  // Link session easy123 to tenant
  const session = await prisma.session.findUnique({
    where: { sessionId: "easy123" }
  });

  if (session) {
    await prisma.session.update({
      where: { sessionId: "easy123" },
      data: { tenantId: tenant.id }
    });
    console.log("Successfully linked session 'easy123' to Tenant:", tenant.name);
  } else {
    console.log("Session 'easy123' not found or already linked.");
  }

  // Seed default knowledge base entries for Easy Motors Biel
  const countKB = await prisma.knowledgeEntry.count({
    where: { tenantId: tenant.id }
  });

  if (countKB === 0) {
    await prisma.knowledgeEntry.createMany({
      data: [
        {
          tenantId: tenant.id,
          category: "FAQ",
          title: "Öffnungszeiten & Standort",
          content: "Easy Motors Biel ist Montag bis Freitag von 08:00 bis 18:30 Uhr und Samstag von 09:00 bis 16:00 Uhr geöffnet. Sonntag geschlossen. Standort: Biel/Bienne.",
          isVerified: true
        },
        {
          tenantId: tenant.id,
          category: "SERVICE",
          title: "Fahrzeugverkauf & Probefahrt",
          content: "Wir bieten geprüfte Occasionen und Neuwagen aller Marken. Probefahrten können jederzeit vereinbart werden.",
          isVerified: true
        },
        {
          tenantId: tenant.id,
          category: "SERVICE",
          title: "Werkstatt & MFK",
          content: "Kompletter Service, MFK-Vorbereitung und -Prüfung, Reifenwechsel, Diagnose und Karosseriearbeiten.",
          isVerified: true
        }
      ]
    });
    console.log("Seeded 3 knowledge base entries for Easy Motors Biel");
  }

  // Record audit log
  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      userId: admin.id,
      action: "PLATFORM_INITIALIZATION",
      resource: `Tenant:${tenant.id}`,
      details: {
        migratedSession: "easy123",
        status: "SUCCESS"
      }
    }
  });

  console.log("Migration complete!");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
