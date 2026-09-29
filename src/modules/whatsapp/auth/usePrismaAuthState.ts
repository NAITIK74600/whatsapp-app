import { prisma } from "@/lib/prisma";
import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, proto, SignalDataTypeMap } from "@whiskeysockets/baileys";
import { logger } from "@/lib/logger";

const fixKey = (type: string, id: string) => `${type}-${id.replace(/\//g, '__').replace(/:/g, '-')}`;

export const usePrismaAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {
    
    // Helper to read single JSON with Buffer handling
    const readData = async (type: string, id: string) => {
        try {
            const key = fixKey(type, id);
            const data = await prisma.authState.findUnique({
                where: { sessionId_key: { sessionId, key } }
            });
            if (data && data.value) {
                return JSON.parse(JSON.stringify(data.value), BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            logger.error("Auth", `Error reading auth state (${type}-${id}):`, error);
            return null;
        }
    };

    // Helper to write single data key
    const writeData = async (type: string, id: string, data: any) => {
        try {
            const key = fixKey(type, id);
            const value = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
            
            await prisma.authState.upsert({
                where: { sessionId_key: { sessionId, key } },
                create: { sessionId, key, value },
                update: { value }
            });
        } catch (error) {
            logger.error("Auth", `Error writing auth state (${type}-${id}):`, error);
        }
    };

    const removeData = async (type: string, id: string) => {
        try {
            const key = fixKey(type, id);
            await prisma.authState.deleteMany({
                where: { sessionId, key }
            });
        } catch (error) {
            // ignore deletion failures on missing keys
        }
    };

    // Batch chunk runner to avoid exhausting MySQL connection pool (max 4 concurrent queries)
    const runInBatches = async <T>(tasks: (() => Promise<T>)[], batchSize = 4): Promise<void> => {
        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);
            await Promise.all(batch.map(fn => fn()));
        }
    };

    const creds: AuthenticationCreds = (await readData('creds', 'me')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
                    if (!ids || ids.length === 0) return data;

                    try {
                        // Batch fetch all requested keys in ONE query instead of N individual queries
                        const keyMap = new Map<string, string>(); // fixedKey -> original id
                        const searchKeys = ids.map(id => {
                            const k = fixKey(type, id);
                            keyMap.set(k, id);
                            return k;
                        });

                        const records = await prisma.authState.findMany({
                            where: {
                                sessionId,
                                key: { in: searchKeys }
                            }
                        });

                        for (const record of records) {
                            const originalId = keyMap.get(record.key);
                            if (originalId && record.value) {
                                let value = JSON.parse(JSON.stringify(record.value), BufferJSON.reviver);
                                if (type === 'app-state-sync-key' && value) {
                                    value = proto.Message.AppStateSyncKeyData.fromObject(value);
                                }
                                data[originalId] = value;
                            }
                        }
                    } catch (error) {
                        logger.error("Auth", `Batch get keys error for ${type}:`, error);
                    }

                    return data;
                },
                set: async (data) => {
                    const tasks: (() => Promise<void>)[] = [];
                    for (const category in data) {
                        const categoryData = data[category as keyof typeof data];
                        if (!categoryData) continue;
                        
                        for (const id in categoryData) {
                            const value = categoryData[id];
                            if (value) {
                                tasks.push(() => writeData(category, id, value));
                            } else {
                                tasks.push(() => removeData(category, id));
                            }
                        }
                    }
                    if (tasks.length > 0) {
                        await runInBatches(tasks, 4);
                    }
                }
            }
        },
        saveCreds: async () => {
            await writeData('creds', 'me', creds);
        }
    };
};
