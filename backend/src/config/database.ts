import mongoose from 'mongoose';

/**
 * Conecta la aplicacion con la base de datos local de MongoDB.
 * Si la conexion falla se corta el arranque del proceso: un servidor
 * levantado sin base de datos responderia con errores en cada peticion.
 */
export const conectarDB = async (): Promise<void> => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('[MongoDB] Falta la variable MONGO_URI en el archivo .env');
    process.exit(1);
  }

  try {
    // Si Mongo no responde en 5 segundos se corta el intento.
    // Por defecto Mongoose espera 30 segundos antes de avisar del fallo.
    const conexion = await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log(
      `[MongoDB] Conectado a ${conexion.connection.host}:${conexion.connection.port}/${conexion.connection.name}`
    );
  } catch (error) {
    console.error('[MongoDB] Error de conexion:', (error as Error).message);
    process.exit(1);
  }
};
