import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import Usuario from '../models/Usuario';

/**
 * POST /api/auth/login
 *
 * Recibe { correo, password }, valida las credenciales contra MongoDB
 * y devuelve { token } con un JWT firmado que expira en 24 horas.
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    // El ?? {} evita un TypeError si el cuerpo no llego parseado.
    // Pasa cuando el cliente no manda la cabecera Content-Type: application/json:
    // express.json() no lo procesa y req.body queda undefined. Sin esta guarda
    // la peticion terminaria en un 500, cuando en realidad es un error del cliente.
    const { correo, password } = req.body ?? {};

    if (!correo || !password) {
      res.status(400).json({ mensaje: 'El correo y la contraseña son obligatorios' });
      return;
    }

    // Se pide el password explicitamente porque el esquema lo marca
    // como select: false y no viene en las consultas normales.
    const usuario = await Usuario.findOne({
      correo: String(correo).toLowerCase().trim()
    }).select('+password');

    // Mismo mensaje generico para "el correo no existe" y para
    // "la contrasena no coincide". Distinguirlos le permitiria a un
    // atacante averiguar que correos estan registrados en el sistema.
    if (!usuario) {
      res.status(401).json({ mensaje: 'Credenciales inválidas' });
      return;
    }

    const passwordCorrecta = await usuario.compararPassword(password);

    if (!passwordCorrecta) {
      res.status(401).json({ mensaje: 'Credenciales inválidas' });
      return;
    }

    const secreto = process.env.JWT_SECRET;

    if (!secreto) {
      console.error('[Auth] Falta la variable JWT_SECRET en el archivo .env');
      res.status(500).json({ mensaje: 'Error interno del servidor' });
      return;
    }

    // El payload lleva solo datos de identidad no sensibles.
    // Nunca la contrasena ni el hash: el payload va en Base64URL,
    // no cifrado, y cualquiera puede leerlo pegando el token en jwt.io.
    const token = jwt.sign(
      {
        id: usuario._id,
        correo: usuario.correo,
        rol: usuario.rol
      },
      secreto,
      { expiresIn: '24h' }
    );

    res.status(200).json({ token });
  } catch (error) {
    console.error('[Auth] Error en el login:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
