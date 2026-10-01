// B9: badge y header de alertas cuentan TIPOS visibles; tap en la fila = descartar
// (la alerta re-aparece cuando el conteo cambia: nuevo pendiente o aprobacion parcial)
const fs = require('fs');
const FILE = 'src/pages/Home/HomePage.tsx';
let src = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');

function replaceOnce(haystack, needle, replacement, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  return haystack.split(needle).join(replacement);
}

// 1. la definicion de totalAlertas sale; entra el modelo data-driven
src = replaceOnce(
  src,
  "  const totalAlertas = alerts?.total_alertas ?? 0",
  [
    "  interface AlertaFila {",
    "    key: string",
    "    texto: string",
    "    conteo: number",
    "    navegar?: string",
    "  }",
    "",
    "  const ALERTAS_DESCARTADAS_KEY = 'home_alertas_descartadas'",
    "  const [descartadas, setDescartadas] = useState<Record<string, number>>({})",
    "",
    "  // Dismissals persist per alert type: tapping the row records the count it",
    "  // was seen at; the row re-appears whenever that count changes again (a new",
    "  // pending item, or a partial approval that leaves a different number).",
    "  useEffect(() => {",
    "    try {",
    "      setDescartadas(JSON.parse(localStorage.getItem(ALERTAS_DESCARTADAS_KEY) || '{}') as Record<string, number>)",
    "    } catch {",
    "      // Corrupted storage falls back to nothing dismissed.",
    "    }",
    "  }, [])",
    "",
    "  const descartarAlertas = (fila: AlertaFila) => {",
    "    try {",
    "      const data = { ...descartadas, [fila.key]: fila.conteo }",
    "      localStorage.setItem(ALERTAS_DESCARTADAS_KEY, JSON.stringify(data))",
    "      setDescartadas(data)",
    "    } catch {",
    "      // Without storage the dismissal just lasts for this mount.",
    "    }",
    "  }",
    "",
    "  const alertasFilas = useMemo((): AlertaFila[] => {",
    "    if (!alerts) return []",
    "    const filas: AlertaFila[] = []",
    "    if (alerts.egresos_cuarentena > 0) {",
    "      filas.push({ key: 'cuarentena', texto: '📥 Transacciones en Cuarentena', conteo: alerts.egresos_cuarentena, navegar: '/cuarentena' })",
    "    }",
    "    if (alerts.billeteras_rojas > 0) {",
    "      filas.push({ key: 'rojas', texto: '🔴 Cuentas desconciliadas / en rojo', conteo: alerts.billeteras_rojas })",
    "    }",
    "    if (alerts.dias_asfixia_proximos > 0) {",
    "      filas.push({ key: 'asfixia', texto: t('home_alert_asfixia'), conteo: alerts.dias_asfixia_proximos })",
    "    }",
    "    return filas",
    "  }, [alerts, t, alerts])",
    "",
    "  // A row stays hidden only while its count has not changed since dismissal.",
    "  const filasVisibles = alertasFilas.filter((fila) => descartadas[fila.key] !== fila.conteo)",
  ].join('\n'),
  'modelo'
);

// 2. el badge de la campana
src = replaceOnce(
  src,
  "            {totalAlertas > 0 && (\n              <span className=\"badge badge-red animate-pulse\" style={{ position: 'absolute', top: -4, right: -4, fontSize: 'calc(10px * var(--font-scale))' }}>\n                {totalAlertas}\n              </span>\n            )}",
  "            {filasVisibles.length > 0 && (\n              <span className=\"badge badge-red animate-pulse\" style={{ position: 'absolute', top: -4, right: -4, fontSize: 'calc(10px * var(--font-scale))' }}>\n                {filasVisibles.length}\n              </span>\n            )}",
  'badge'
);

// 3. el header del panel
src = replaceOnce(
  src,
  '<span className="home-alerts-title">Alertas Activas ({totalAlertas})</span>',
  '<span className="home-alerts-title">Alertas Activas ({filasVisibles.length})</span>',
  'header'
);

// 4. las tres filas condicionales -> una sola lista
src = replaceOnce(
  src,
  "            {alerts.egresos_cuarentena > 0 && (\n              <div className=\"alert-item-row\" style={{ cursor: 'pointer' }} onClick={() => navigate('/cuarentena')}>\n                <span className=\"alert-item-label\">📥 Transacciones en Cuarentena</span>\n                <span className=\"alert-item-badge\">{alerts.egresos_cuarentena}</span>\n              </div>\n            )}\n            {alerts.billeteras_rojas > 0 && (\n              <div className=\"alert-item-row\" style={{ borderLeftColor: 'var(--coral)' }}>\n                <span className=\"alert-item-label\">🔴 Cuentas desconciliadas / en rojo</span>\n                <span className=\"alert-item-badge\">{alerts.billeteras_rojas}</span>\n              </div>\n            )}\n            {alerts.dias_asfixia_proximos > 0 && (\n              <div className=\"alert-item-row\" style={{ borderLeftColor: 'var(--coral)' }}>\n                <span className=\"alert-item-label\">{t(\"home_alert_asfixia\")}</span>\n                <span className=\"alert-item-badge\">{alerts.dias_asfixia_proximos}</span>\n              </div>\n            )}",
  [
    "            {filasVisibles.map((fila) => (",
    "              <div",
    "                key={fila.key}",
    "                className=\"alert-item-row\"",
    "                style={{ cursor: 'pointer', borderLeftColor: fila.key === 'cuarentena' ? undefined : 'var(--coral)' }}",
    "                onClick={() => {",
    "                  descartarAlertas(fila)",
    "                  if (fila.navegar) navigate(fila.navegar)",
    "                }}",
    "              >",
    "                <span className=\"alert-item-label\">{fila.texto}</span>",
    "                <span className=\"alert-item-badge\">{fila.conteo}</span>",
    "              </div>",
    "            ))}",
  ].join('\n'),
  'filas'
);

// 5. el mensaje de panel vacio
src = replaceOnce(
  src,
  "            {totalAlertas === 0 && (\n              <p className=\"text-xs text-muted text-center py-2\">{t('alert_all_ok_no_alerts')}</p>\n            )}",
  "            {filasVisibles.length === 0 && (\n              <p className=\"text-xs text-muted text-center py-2\">{t('alert_all_ok_no_alerts')}</p>\n            )}",
  'vacio'
);

fs.writeFileSync(FILE, src);
console.log('B9 OK');