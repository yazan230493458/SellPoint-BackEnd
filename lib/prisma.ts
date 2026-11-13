import {PrismaPg} from "@prisma/adapter-pg";
import { PrismaClient } from "../generator/prisma/client.js"
import "dotenv/config"

const databaseUrl = process.env.DATABASE_URL

const adapter = new PrismaPg({
    connectionString: databaseUrl
})

const prisma = new PrismaClient({adapter})

export default prisma