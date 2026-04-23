const lines = (process.env.SCRIPT || '').split(';');
const exitCode = Number(process.env.EXIT_CODE ?? 0);

(async () => {
  for (const line of lines) {
    if (line) console.log(line);
    await new Promise(r => setTimeout(r, 10));
  }
  process.exit(exitCode);
})();
