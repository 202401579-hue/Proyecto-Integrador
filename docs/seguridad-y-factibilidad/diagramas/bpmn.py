import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon, Circle, Rectangle

plt.rcParams['font.family'] = 'DejaVu Sans'
LW = [1.06, 1.06, 1.06, 2.66, 1.06]
names = ['Coordinador\nLogístico', 'Proveedor', 'Operador de\nRecepción', 'Sistema\nSumaControl', 'Supervisor de\nDesembarque']
fills = ['#EEF4FA', '#FFF7E6', '#EEF4FA', '#EAF5EC', '#EEF4FA']
RH = 0.82; NR = 11; HEAD = 0.5
H = HEAD + RH * NR
fig, ax = plt.subplots(figsize=(6.9, H))
ax.set_xlim(0, 6.9); ax.set_ylim(0, H); ax.axis('off')
xs = [sum(LW[:i]) for i in range(5)]
for i in range(5):
    ax.add_patch(Rectangle((xs[i], 0), LW[i], H - HEAD, fc=fills[i], ec='#7F9DBA', lw=1))
    ax.add_patch(Rectangle((xs[i], H - HEAD), LW[i], HEAD, fc='#1F4E79', ec='#1F4E79'))
    ax.text(xs[i] + LW[i] / 2, H - HEAD / 2, names[i], color='white', ha='center', va='center', fontsize=6.8, fontweight='bold')
def X(lane, sub=None):
    return xs[lane] + (LW[lane] / 2 if sub is None else (0.62 if sub == 'L' else 2.02))
def Y(r): return H - HEAD - RH * (r + 0.5)
P = {}
def task(k, lane, r, txt, sub=None, w=0.96, h=0.56):
    cx, cy = X(lane, sub), Y(r); P[k] = (cx, cy, w, h)
    ax.add_patch(FancyBboxPatch((cx - w/2, cy - h/2), w, h, boxstyle='round,pad=0.01,rounding_size=0.09', fc='white', ec='#1F4E79', lw=1.1))
    ax.text(cx, cy, txt, ha='center', va='center', fontsize=4.9, linespacing=1.15)
def event(k, lane, r, kind, sub=None):
    cx, cy = X(lane, sub), Y(r); P[k] = (cx, cy, 0.3, 0.3)
    if kind == 'start': ax.add_patch(Circle((cx, cy), 0.14, fc='#C6E0B4', ec='#1E6B3A', lw=1.6))
    else:
        ax.add_patch(Circle((cx, cy), 0.14, fc='#F4B6B6', ec='#C00000', lw=2.6))
def gate(k, lane, r, txt, sub=None):
    cx, cy = X(lane, sub), Y(r); P[k] = (cx, cy, 0.9, 0.7)
    ax.add_patch(Polygon([(cx, cy+0.37), (cx+0.5, cy), (cx, cy-0.37), (cx-0.5, cy)], fc='#FFF2CC', ec='#BF9000', lw=1.2))
    ax.text(cx, cy, txt, ha='center', va='center', fontsize=4.6, linespacing=1.1)
def side(k, s):
    cx, cy, w, h = P[k]
    return {'l': (cx - w/2, cy), 'r': (cx + w/2, cy), 't': (cx, cy + h/2), 'b': (cx, cy - h/2)}[s]
def link(pts, dash=False, label=None, lp=None):
    for p, q in zip(pts[:-2], pts[1:-1]):
        ax.plot([p[0], q[0]], [p[1], q[1]], color='#333333', lw=0.9, ls='--' if dash else '-', solid_capstyle='butt')
    ax.annotate('', xy=pts[-1], xytext=pts[-2], arrowprops=dict(arrowstyle='-|>', color='#333333', lw=0.9, mutation_scale=7, linestyle='--' if dash else '-', shrinkA=0, shrinkB=0))
    if label:
        x, y = lp
        ax.text(x, y, label, fontsize=4.6, ha='center', va='center', style='italic', bbox=dict(fc='white', ec='none', pad=0.6, alpha=0.9))

event('ini', 0, 0, 'start')
task('t1', 0, 1, 'Registrar proveedor\ny programar cita\n(HU-001)')
task('t2', 1, 2, 'Llega a la garita\ncon su código\nde pedido')
task('t3', 2, 3, 'Registrar llegada\nreal (HU-002)')
task('s2', 3, 4, 'Clasificar puntualidad:\nA TIEMPO · ANTICIPADO\nTARDÍO · AUSENTE', 'L', w=1.1)
gate('g1', 3, 5, '¿Gateway\ncompatible\nlibre?', 'L')
task('s4', 3, 5, 'Ingresar a la cola de\nprioridad y aplicar\naging', 'R', w=1.1)
task('s3', 3, 6, 'Asignar gateway\n(RN-08: G5 solo\nconstrucción)', 'L')
task('s5', 3, 6, 'Promover al liberarse\nun gateway\ncompatible', 'R', w=1.1)
task('d1', 4, 7, 'Iniciar descarga')
task('d2', 4, 8, 'Finalizar descarga')
task('s6', 3, 9, 'Liberar gateway,\nregistrar evento y\nactualizar KPIs', 'L')
event('fin', 3, 10, 'end', 'L')

link([side('ini', 'b'), side('t1', 't')])
a = side('t1', 'r'); b = side('t2', 't')
link([a, (b[0], a[1]), b], dash=True, label='cita informada', lp=(b[0] + 0.05, a[1] + 0.1))
a = side('t2', 'r'); b = side('t3', 't')
link([a, (b[0], a[1]), b], dash=True)
a = side('t3', 'r'); b = side('s2', 't')
link([a, (b[0], a[1]), b])
link([side('s2', 'b'), side('g1', 't')])
link([side('g1', 'r'), side('s4', 'l')], label='No', lp=(X(3, 'L') + 0.67, Y(5) + 0.12))
link([side('g1', 'b'), side('s3', 't')], label='Sí', lp=(X(3, 'L') + 0.1, Y(5) - 0.5))
link([side('s4', 'b'), side('s5', 't')])
link([side('s5', 'l'), side('s3', 'r')], label='libera', lp=(X(3, 'L') + 0.67, Y(6) + 0.12))
a = side('s3', 'b'); b = side('d1', 't'); ym = Y(6) - 0.42
link([a, (a[0], ym), (b[0], ym), b])
a = side('d1', 'b'); b = side('d2', 't'); link([a, b])
a = side('d2', 'b'); b = side('s6', 'r'); ym = Y(9)
link([a, (a[0], b[1]), b])
link([side('s6', 'b'), side('fin', 't')])
fig.savefig('bpmn.png', dpi=300, bbox_inches='tight', pad_inches=0.05)
