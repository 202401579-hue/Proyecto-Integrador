import jwt from 'jsonwebtoken';
import { NextFunction, Request, Response } from 'express';
import { verificarToken } from '../middlewares/verificarToken';
import { esPayloadDeAcceso } from '../types/auth';
import { DURACION_TOKEN_ACCESO, DURACION_TOKEN_TEMPORAL, firmarTokenDeAcceso, firmarTokenTemporal } from '../services/tokens';

describe('claims de los tokens Sprint 7', () => {
  const secreto = 'secreto-de-prueba';

  it('emite ACCESS con roles, permisos y sin el campo rol heredado', () => {
    const token = firmarTokenDeAcceso(
      {
        id: 'usuario-1',
        correo: 'usuario@prueba.local',
        roles: ['Operador'],
        permisos: ['pedidos', 'gateways', 'descargas', 'cola']
      },
      secreto
    );
    const payload = jwt.verify(token, secreto) as jwt.JwtPayload;

    expect(payload.type).toBe('ACCESS');
    expect(payload.roles).toEqual(['Operador']);
    expect(payload.permisos).toEqual(['pedidos', 'gateways', 'descargas', 'cola']);
    expect(payload.rol).toBeUndefined();
    expect(DURACION_TOKEN_ACCESO).toBe('8h');
  });

  it('rechaza como ACCESS el token heredado que no contiene permisos', () => {
    expect(
      esPayloadDeAcceso({
        id: 'usuario-1',
        correo: 'usuario@prueba.local',
        type: 'ACCESS'
      } as never)
    ).toBe(false);
  });

  it('responde 401 ante un JWT ACCESS heredado sin permisos', () => {
    const tokenHeredado = jwt.sign(
      { id: 'usuario-1', correo: 'usuario@prueba.local', rol: 'Operador', type: 'ACCESS' },
      secreto,
      { expiresIn: '8h' }
    );
    const anterior = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secreto;
    const req = { headers: { authorization: `Bearer ${tokenHeredado}` } } as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    verificarToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    if (anterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = anterior;
  });

  it('mantiene MFA_TEMP separado y con duración de cinco minutos', () => {
    const { token, jti } = firmarTokenTemporal('usuario-1', secreto);
    const payload = jwt.verify(token, secreto) as jwt.JwtPayload;

    expect(payload).toMatchObject({ id: 'usuario-1', type: 'MFA_TEMP', jti });
    expect(payload.roles).toBeUndefined();
    expect(payload.permisos).toBeUndefined();
    expect(DURACION_TOKEN_TEMPORAL).toBe('5m');
  });
});
