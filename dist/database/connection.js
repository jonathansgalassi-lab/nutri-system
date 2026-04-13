"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
exports.queryOne = queryOne;
exports.withTransaction = withTransaction;
exports.checkConnection = checkConnection;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não definida nas variáveis de ambiente');
}
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
exports.pool.on('error', (err) => {
    console.error('Erro inesperado no pool do PostgreSQL:', err);
    process.exit(-1);
});
async function query(text, params) {
    const result = await exports.pool.query(text, params);
    return result.rows;
}
async function queryOne(text, params) {
    const rows = await query(text, params);
    return rows[0] ?? null;
}
async function withTransaction(fn) {
    const client = await exports.pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
async function checkConnection() {
    const client = await exports.pool.connect();
    try {
        await client.query('SELECT 1');
        console.log('Conexão com o banco de dados estabelecida.');
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=connection.js.map