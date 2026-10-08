Deno.test('portable suite has no ambient runtime permissions', async () => {
  for (const name of ['read', 'write', 'net', 'env', 'run', 'ffi', 'sys'] as const) {
    const permission = await Deno.permissions.query({ name });
    if (permission.state === 'granted') throw new Error(`Unexpected runtime permission: ${name}`);
  }
});
