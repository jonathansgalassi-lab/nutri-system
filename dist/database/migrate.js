"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const connection_1 = require("./connection");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
async function migrate() {
    const client = await connection_1.pool.connect();
    try {
        // Garante tabela de controle de migrations
        await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);
        const migrationsDir = path_1.default.join(__dirname, 'migrations');
        const files = fs_1.default
            .readdirSync(migrationsDir)
            .filter((f) => f.endsWith('.sql'))
            .sort();
        for (const file of files) {
            const { rows } = await client.query('SELECT id FROM migrations WHERE name = $1', [file]);
            if (rows.length > 0) {
                console.log(`Pulando (já executada): ${file}`);
                continue;
            }
            const sql = fs_1.default.readFileSync(path_1.default.join(migrationsDir, file), 'utf-8');
            console.log(`Executando migration: ${file}`);
            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
                await client.query('COMMIT');
                console.log(`Migration concluída: ${file}`);
            }
            catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
        }
        console.log('Todas as migrations executadas com sucesso.');
    }
    finally {
        client.release();
        await connection_1.pool.end();
    }
}
migrate().catch((err) => {
    console.error('Erro ao executar migrations:', err);
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map