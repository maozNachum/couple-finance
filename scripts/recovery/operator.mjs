import { prepare, startSource, readState, restore, startRecovered } from './local-drill.mjs';
import { requireThat } from './guard.mjs';

const [command, lab, extra, confirmation, ...rest] = process.argv.slice(2);
try {
  requireThat(rest.length === 0 && lab, 'INVALID_ARGUMENTS');
  if (command === 'prepare-source' || command === 'prepare-target') {
    requireThat(!confirmation, 'INVALID_ARGUMENTS');
    const state = prepare(lab, command === 'prepare-source' ? 'source' : 'target', Number(extra));
    console.log(JSON.stringify({ project: state.project, phase: state.phase, workdir: state.workdir }));
  } else if (command === 'start-source') {
    requireThat(!extra && !confirmation, 'INVALID_ARGUMENTS');
    const state = startSource(lab);
    console.log(JSON.stringify({ project: state.project, phase: state.phase }));
  } else if (command === 'restore') {
    requireThat(extra && confirmation, 'EXPLICIT_TARGET_AND_CONFIRMATION_REQUIRED');
    const state = restore(lab, extra, confirmation);
    console.log(JSON.stringify({ project: state.project, phase: state.phase }));
  } else if (command === 'start-recovered') {
    requireThat(!extra && !confirmation, 'INVALID_ARGUMENTS');
    const state = startRecovered(lab);
    console.log(JSON.stringify({ project: state.project, phase: state.phase }));
  } else if (command === 'status') {
    requireThat(!extra && !confirmation, 'INVALID_ARGUMENTS');
    const state = readState(lab);
    console.log(JSON.stringify({ project: state.project, phase: state.phase }));
  } else throw new Error('UNKNOWN_COMMAND');
} catch (error) {
  console.error(/^[A-Z_]+$/.test(error.message) ? error.message : 'RECOVERY_OPERATION_FAILED');
  process.exitCode = 1;
}
