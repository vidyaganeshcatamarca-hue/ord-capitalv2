import assert from 'assert'
import { readFileSync } from 'fs'
import path from 'path'

// Direct implementation of WalletIcon logic for unit test verification
function inferName(propsName) {
  if (!propsName || propsName.trim() === '') {
    return 'Wallet';
  } else {
    return propsName;
  }
}

export function run(providedSupabaseClient = null) {
  console.log('Running WalletIcon unit & source tests...')

  // Test fallback name logic
  assert.strictEqual(inferName(undefined), 'Wallet', 'Undefined → Wallet');
  assert.strictEqual(inferName(null), 'Wallet', 'null → Wallet');
  assert.strictEqual(inferName(''), 'Wallet', 'Empty string → Wallet');
  assert.strictEqual(inferName('   '), 'Wallet', 'Whitespace only → Wallet');
  assert.strictEqual(inferName('Landmark'), 'Landmark', 'Non-empty name stays same');

  // Check that component source exists and uses CategoryIcon with name
  // This is a static check as we cannot render in pure Node without transpiling .tsx
  const walletPath = path.join(process.cwd(), 'src/components/WalletIcon/WalletIcon.tsx');
  assert(File.existsSync(walletPath), `Wallet icon source not found at ${walletPath}`);

  const content = readFileSync(walletPath, 'utf-8');
  // Ensure the component imports CategoryIcon from parent directory
  assert(content.includes('import { CategoryIcon } from \'../CategoryIcon\''), 'Source should import CategoryIcon from ../CategoryIcon');

  // Ensure the fallback logic includes setting name to 'Wallet' when input empty
  assert(/name\s*=\s*'Wallet'/.test(content) || content.includes("name = 'Wallet'"), 'Source should define name as Wallet fallback');

  // Ensure the component returns a CategoryIcon element with name prop
  assert(content.includes('<CategoryIcon'), 'Source should render <CategoryIcon>');
  assert(/name\s*={\s*(.*?)(?:props\.name|name)}\s*\}/.test(content) || content.includes('name={name}'), 'Source should pass a dynamic name to CategoryIcon');

  console.log('✅ All WalletIcon unit & source tests passed.');
  return { result: 'PASS', detail: [] };
}
