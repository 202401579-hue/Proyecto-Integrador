import {
  ErrorPermisos,
  EstadoRolProtegido,
  unirPermisos,
  validarListaPermisos,
  validarProteccionAdministrador
} from '../services/permisos';

describe('permisos de roles', () => {
  it('une permisos sin duplicados y conserva el orden de aparición', () => {
    expect(unirPermisos(['pedidos', 'cola'], ['cola', 'kpis'], ['pedidos', 'usuarios'])).toEqual([
      'pedidos',
      'cola',
      'kpis',
      'usuarios'
    ]);
  });

  it('rechaza permisos fuera de la lista cerrada y listas vacías', () => {
    expect(() => validarListaPermisos(['pedidos', 'inventario'])).toThrow(ErrorPermisos);
    expect(() => validarListaPermisos([])).toThrow(ErrorPermisos);
  });

  it('normaliza una lista válida eliminando duplicados', () => {
    expect(validarListaPermisos(['roles', 'usuarios', 'roles'])).toEqual(['roles', 'usuarios']);
  });

  it('no deja quitar los permisos administrativos del Administrador', () => {
    expect(() =>
      validarProteccionAdministrador(
        { nombreRol: 'Administrador', permisos: ['usuarios', 'roles', 'kpis'], activo: true },
        { permisos: ['roles', 'kpis'] }
      )
    ).toThrow('debe conservar los permisos usuarios y roles');
  });

  it('no deja renombrar ni desactivar al Administrador', () => {
    const administrador: EstadoRolProtegido = {
      nombreRol: 'Administrador',
      permisos: ['usuarios', 'roles'],
      activo: true
    };
    expect(() => validarProteccionAdministrador(administrador, { nombreRol: 'Superadministrador' })).toThrow(
      'no se puede renombrar'
    );
    expect(() => validarProteccionAdministrador(administrador, { activo: false })).toThrow('no se puede desactivar');
  });

  it('exige permisos administrativos si otro rol pasa a llamarse Administrador', () => {
    expect(() =>
      validarProteccionAdministrador(
        { nombreRol: 'Supervisor', permisos: ['kpis'], activo: true },
        { nombreRol: 'Administrador', permisos: ['kpis'] }
      )
    ).toThrow('debe conservar los permisos usuarios y roles');
  });
});
