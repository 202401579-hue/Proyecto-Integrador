import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams['font.family'] = 'DejaVu Sans'
fig, ax = plt.subplots(figsize=(11, 6.2))
ax.set_xlim(0, 11); ax.set_ylim(0, 6.2); ax.axis('off')
AZ = '#1F4E79'
ymid = 3.1
ax.annotate('', xy=(8.55, ymid), xytext=(0.3, ymid), arrowprops=dict(arrowstyle='-|>', color=AZ, lw=3, mutation_scale=20))
ax.text(9.75, ymid, 'Cuellos de botella\ny desorden en la\nrecepción y el\ndesembarque de\nproveedores', ha='center', va='center', fontsize=10.5, fontweight='bold', color='white',
        bbox=dict(boxstyle='round,pad=0.5', fc=AZ, ec=AZ))
cats = [
 ('PROCESOS', 2.2, True, ['Citas coordinadas por llamadas y correos', 'Registro manual de la puntualidad', 'Asignación de gateways sin criterio']),
 ('PERSONAS', 5.0, True, ['Operador asigna a su criterio', 'Sin reglas de prioridad', 'Coordinación difícil en horas pico']),
 ('TECNOLOGÍA', 7.8, True, ['Hojas de cálculo y registros aislados', 'Agenda, puntualidad y gateways\nsin integrar', 'Sin motor de cola ni aging']),
 ('INFORMACIÓN', 2.2, False, ['Sin hora real de arribo confiable', 'Sin historial de eventos', 'Sin KPIs de espera ni utilización']),
 ('INFRAESTRUCTURA', 5.0, False, ['Solo 5 gateways disponibles', 'Gateway 5 solo construcción', 'Llegadas simultáneas de carga\ngeneral y de construcción']),
 ('GESTIÓN', 7.8, False, ['Sin inversión previa en un sistema\nespecializado', 'Sin política de tolerancias de\npuntualidad', 'Sin indicadores para decidir']),
]
for nombre, x, arriba, causas in cats:
    ytop = 5.45 if arriba else 0.75
    x0 = x - 0.9
    ax.plot([x0, x], [ytop, ymid], color=AZ, lw=2.2)
    ax.text(x0, ytop + (0.18 if arriba else -0.18), nombre, ha='center', va='bottom' if arriba else 'top', fontsize=9.5, fontweight='bold', color='white',
            bbox=dict(boxstyle='round,pad=0.3', fc='#2E75B6', ec='#2E75B6'))
    for i, c in enumerate(causas):
        t = (i + 1) / (len(causas) + 0.6)
        yy = ytop + (ymid - ytop) * t
        xx = x0 + (x - x0) * t
        ax.plot([xx - 0.28, xx], [yy, yy], color='#555555', lw=1)
        ax.text(xx - 0.32, yy, c, ha='right', va='center', fontsize=7.2, color='#222222', linespacing=1.1)
fig.savefig('ishikawa.png', dpi=250, bbox_inches='tight', pad_inches=0.08)
