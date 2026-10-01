// t() en nombres seed (wallet/tarjeta/cuenta) — patron igual que categorias
const fs = require('fs');

function replaceOnce(file, needle, replacement, label) {
  let src = fs.readFileSync(file, 'utf8').split('\r\n').join('\n');
  const count = src.split(needle).length - 1;
  if (count !== 1) { console.error('ABORT ' + label + ': hay ' + count); process.exit(1); }
  fs.writeFileSync(file, src.split(needle).join(replacement));
  console.log('OK ' + label);
}

// 1. CuarentenaPage: el chip de billetera
replaceOnce(
  'src/pages/Cuarentena/CuarentenaPage.tsx',
  '<CategoryIcon name="WalletCards" size={14} /> {p.billetera_nombre || p.billetera_destino_nombre || \'-\'}',
  '<CategoryIcon name="WalletCards" size={14} /> {t(p.billetera_nombre || p.billetera_destino_nombre || \'-\')}',
  'chip-cuarentena'
);

// 2. itemMetaParts (bandeja): los 4 nombres
replaceOnce(
  'src/components/saneamiento/BandejaCuarentena.tsx',
  "    if (item.billetera_nombre) parts.push(item.billetera_nombre)\n    if (item.billetera_destino_nombre) parts.push(item.billetera_destino_nombre)\n  } else if (item.billetera_nombre) {\n    parts.push(item.billetera_nombre)\n  }",
  "    if (item.billetera_nombre) parts.push(t(item.billetera_nombre))\n    if (item.billetera_destino_nombre) parts.push(t(item.billetera_destino_nombre))\n  } else if (item.billetera_nombre) {\n    parts.push(t(item.billetera_nombre))\n  }",
  'chips-billetera'
);
replaceOnce(
  'src/components/saneamiento/BandejaCuarentena.tsx',
  "  if (tipo === 'card_expense' && item.tarjeta_nombre) parts.push(item.tarjeta_nombre)",
  "  if (tipo === 'card_expense' && item.tarjeta_nombre) parts.push(t(item.tarjeta_nombre))",
  'chip-tarjeta'
);
replaceOnce(
  'src/components/saneamiento/BandejaCuarentena.tsx',
  "  if (tipo === 'income' && item.cuenta_ingreso_nombre) parts.push(item.cuenta_ingreso_nombre)",
  "  if (tipo === 'income' && item.cuenta_ingreso_nombre) parts.push(t(item.cuenta_ingreso_nombre))",
  'chip-ingreso'
);

// 3. contextBuilder: el LLM ve el nombre de display
replaceOnce(
  'src/voice/contextBuilder.ts',
  '      name: wallet.nombre,',
  '      // Seed wallets store an i18n key as the name: the LLM matches the\n      // display name the user actually says ("efectivo").\n      name: t(wallet.nombre),',
  'context-wallet'
);
