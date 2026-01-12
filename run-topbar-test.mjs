import { execSync } from 'child_process';

try {
  const result = execSync('npm test -- TopBar.test.tsx', {
    encoding: 'utf-8',
    cwd: process.cwd(),
    stdio: 'pipe'
  });
  console.log(result);
} catch (error) {
  console.error('Test failed:');
  console.error(error.stdout);
  console.error(error.stderr);
  process.exit(error.status || 1);
}
