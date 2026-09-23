const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const stripOuterQuotes = (value) => value?.trim().replace(/^(['"])(.*)\1$/, "$2");

async function main() {
    const email = stripOuterQuotes(process.argv[2])?.toLowerCase();
    const password = stripOuterQuotes(process.argv[3]);

    if (!email) {
        console.error("Please provide email. Usage: node scripts/setup-admin.js <email> [password]");
        process.exit(1);
    }

    const existingUser = await prisma.user.findUnique({
        where: { email }
    });

    if (existingUser) {
        console.log(`User ${email} found. Promoting to SUPERADMIN...`);
        const data = { role: 'SUPERADMIN' };
        if (password) {
            data.password = await bcrypt.hash(password, 10);
        }
        await prisma.user.update({
            where: { email },
            data
        });
        console.log(password ? "User promoted and password updated successfully!" : "User promoted successfully!");
    } else {
        if (!password) {
            console.error("Password required for new user. Usage: node scripts/setup-admin.js <email> <password>");
            process.exit(1);
        }

        console.log(`Creating new SUPERADMIN user ${email}...`);
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await prisma.user.create({
            data: {
                email,
                name: "Super Admin",
                password: hashedPassword,
                role: 'SUPERADMIN'
            }
        });
        console.log("Super Admin created successfully!");
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
