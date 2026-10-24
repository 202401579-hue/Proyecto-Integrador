import { Request, Response } from 'express';
import Usuario from '../models/Usuario';
import { firmarTokenDeAcceso, obtenerSecreto } from '../services/tokens';

/**
 * POST /api/auth/login
 *
 * Recibe { correo, password }, valida las credenciales contra MongoDB
 * y devuelve { token } con un JWT firmado que expira en
 * DURACION_TOKEN_ACCESO (ver services/tokens.ts).
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

    const secreto = obtenerSecreto();

    if (!secreto) {
      res.status(500).json({ mensaje: 'Error interno del servidor' });
      return;
    }

    // La firma vive en services/tokens.ts: duracion y claims en un solo
    // lugar, para los dos tipos de token que emite el sistema.
    const token = firmarTokenDeAcceso(
      {
        id: String(usuario._id),
        correo: usuario.correo,
        rol: usuario.rol
      },
      secreto
    );

    res.status(200).json({ token });
  } catch (error) {
    console.error('[Auth] Error en el login:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
