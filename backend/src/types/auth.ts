import { Rol } from '../models/Usuario';

/**
 * Forma del payload que viaja dentro del JWT.
 * Son los tres claims acordados por el equipo, mas las marcas de
 * tiempo que agrega jsonwebtoken: iat (emitido) y exp (expira).
 */
export interface PayloadToken {
  id: string;
  correo: string;
  rol: Rol;
  iat?: number;
  exp?: number;
}
