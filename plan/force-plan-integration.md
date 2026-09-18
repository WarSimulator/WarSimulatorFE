# Force plan integration

## Baseline

- Baseline commit: `759972c`
- Tag: `checkpoint-before-force-plan-parser-20260917`
- Includes the current UI, source, Blue/Red JSON, and `Deployment_v4.json`.
- To inspect or run the baseline without discarding later work, create a separate checkout:
  `git worktree add ../Simulator-before-force-parser checkpoint-before-force-plan-parser-20260917`
- This is a repository snapshot. Browser localStorage, installed dependencies, and ignored environment files are not included.

## Fixed input contract

The Planning exports remain unchanged. `parseForcePlan(payload, side)` reads
`temporal_plan.timeline.steps`, joining `pddl_action` to
`generated_decomposition.actions[].action_id`. The timeline owns the schedule;
the decomposition owns action identity and dependencies. Candidate tasks supply
the original conditions and purpose. Identity catalog and role bindings are
preserved as parsing context. Mission family never determines BLUE/RED.

Runtime keys include the plan side, since detection/action IDs can recur in
separate exports. These keys distinguish records; they do not prove that two
detected symbols represent the same physical unit across exports.

The old `temporal_plan.steps` execution JSON remains readable. New input argument
and output count names are `blueForce` and `redForce`.

## Verification

Run `node scripts/test-force-plan.mjs` and `npm run build`.
The test reads both actual exports (72 Blue and 37 Red steps), checks that the
source objects are unchanged, exercises invalid joins/times/dependencies, and
checks legacy playback and a fully bound Planning package using offline routing.

## Remaining stages

The real exports now parse, but do not yet form a playable deployment package.
The builder validates before routing or saving a run and reports unresolved
actors/references, missing task dependencies, and conditional tasks whose
conditions the runtime does not evaluate.

1. Complete the remaining role-only actor and older Red catalogue mappings.
2. Interpret structured task arguments and resolve locations/targets to deployment
   geometry. Raw task tuples remain intact; no split-string coordinate guessing.
3. Handle missing prerequisites and conditions explicitly. The first stage does
   not silently drop a missing dependency or execute a conditional branch.
4. Confirm time units/common epoch before interpreting schedule numbers as real
   elapsed time. The parser currently preserves source timing without conversion.

Successful import or playback does not validate operational feasibility or
combat outcomes. Existing effects remain visualization-only.

## Deployment display names

The current `Deployment_v4.json` designations use the corresponding Planning
actor names. Explicit `execution_actor_bindings` translate detected MUSR actors
to role actors such as `mech-bde-north`; actors without that Plan alias retain
their MUSR name. This requires no scenario mapping table in the engine.

The complete real plans still fail execution preflight where the Plan provides
no matching Deployment designation, location geometry or executable condition.
