import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { conectarDB } from './config/database';
import authRoutes from './routes/authRoutes';
import proveedorRoutes from './routes/proveedorRoutes';
import pedidoRoutes from './routes/pedidoRoutes';

// Carga las variables de entorno antes que cualquier otra cosa,
// porque la conexion a Mongo y la firma del JWT dependen de ellas.
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const ORIGEN_FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';

// CORS: el frontend corre en el puerto 3000 y este servidor en el 4000.
// Son origenes distintos, asi que sin esta cabecera el navegador bloquea el fetch.
app.use(cors({ origin: ORIGEN_FRONTEND }));

// Interpreta el cuerpo de las peticiones en formato JSON.
app.use(express.json());

// Rutas de autenticacion: POST /api/auth/login
app.use('/api/auth', authRoutes);

// Rutas del modulo de proveedores (rol Coordinador)
app.use('/api/proveedores', proveedorRoutes);

// Rutas del modulo de programacion de pedidos (rol Coordinador)
app.use('/api/pedidos', pedidoRoutes);

// Ruta de verificacion: sirve para comprobar que el servidor esta arriba.
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ estado: 'ok', servicio: 'backend-logistica' });
});

const iniciarServidor = async (): Promise<void> => {
  await conectarDB();

  app.listen(PORT, () => {
    console.log(`[Servidor] Escuchando en http://localhost:${PORT}`);
  });
};

iniciarServidor();

export default app;
