// Exercise library. Home kit: functional trainer (dual cable stack, 5 to 70 kg in 5 kg steps),
// adjustable dumbbells 4 to 36 kg in 2 kg steps, Olympic barbell with 2x20, 2x10, 2x5 kg plates,
// incline bench, bodyweight. Machine exercises are gym only.

export type Muscle =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core'

export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'bodyweight' | 'machine'

export interface LibraryExercise {
  id: string
  name: string
  muscle: Muscle
  pattern: string
  equipment: Equipment
  incrementKg: number
  defaultSets: number
  defaultRepLo: number
  defaultRepHi: number
  defaultRestSec: number
  cue: string
  perSide?: boolean
  isometric?: boolean
  /** What the reps field counts. Default: reps, or seconds for isometric holds. */
  unit?: Unit
  kneeGoverned?: boolean
}

export type Unit = 'reps' | 'sec' | 'min'

const X = (
  id: string, name: string, muscle: Muscle, pattern: string, equipment: Equipment,
  incrementKg: number, defaultSets: number, defaultRepLo: number, defaultRepHi: number,
  defaultRestSec: number, cue: string, extra: Partial<LibraryExercise> = {},
): LibraryExercise => ({
  id, name, muscle, pattern, equipment, incrementKg, defaultSets, defaultRepLo,
  defaultRepHi, defaultRestSec, cue, ...extra,
})

export const LIBRARY: LibraryExercise[] = [
  X("bench-press", "Barbell bench press", "chest", "horizontal press", "barbell", 2.5, 4, 6, 10, 150, "Rack safeties at chest height. Feet planted, slight arch."),
  X("db-bench-press", "DB bench press", "chest", "horizontal press", "dumbbell", 2, 4, 8, 12, 120, "Deeper stretch than the bar. Kick DBs up from knees."),
  X("incline-bb-press", "Incline barbell press", "chest", "incline press", "barbell", 2.5, 3, 8, 12, 120, "Bench 30–45°. Bar to upper chest."),
  X("incline-db-press", "Incline DB press", "chest", "incline press", "dumbbell", 2, 3, 8, 12, 120, "Bench 30–45°. Elbows ~45° from torso."),
  X("cable-fly", "Cable chest fly", "chest", "fly", "cable", 5, 3, 12, 15, 90, "Slight forward lean, 1s squeeze at the middle."),
  X("low-high-fly", "Cable fly (low-to-high)", "chest", "fly", "cable", 5, 3, 12, 15, 75, "Upper chest bias. Scoop up and in."),
  X("high-low-fly", "Cable fly (high-to-low)", "chest", "fly", "cable", 5, 3, 12, 15, 75, "Lower chest bias. Press down and together."),
  X("pushup", "Push-up (feet elevated option)", "chest", "horizontal press", "bodyweight", 2, 3, 10, 20, 90, "Elevate feet on bench to progress. Rigid plank."),
  X("db-fly", "DB fly (flat or incline)", "chest", "fly", "dumbbell", 2, 3, 10, 15, 90, "Soft elbows, stop at chest stretch — no deeper."),
  X("pullup-pulldown", "Pull-ups / lat pulldown", "back", "vertical pull", "cable", 5, 4, 6, 10, 150, "Add load once 4×10 is easy. Chest to bar line."),
  X("close-pulldown", "Lat pulldown (neutral/close)", "back", "vertical pull", "cable", 5, 3, 10, 12, 90, "Elbows down and in. Pause at the bottom."),
  X("bb-row", "Barbell row", "back", "horizontal pull", "barbell", 2.5, 4, 6, 10, 150, "Hinge ~45°, soft knees. Bar to lower ribs."),
  X("db-row", "Single-arm DB row", "back", "horizontal pull", "dumbbell", 2, 3, 8, 12, 90, "Knee and hand braced on bench. Row to hip.", {
  perSide: true
}),
  X("seated-row", "Seated cable row", "back", "horizontal pull", "cable", 5, 3, 8, 12, 120, "Chest tall, elbows to hips, no torso swing."),
  X("straight-arm-pulldown", "Straight-arm pulldown", "back", "vertical pull", "cable", 5, 3, 12, 15, 75, "Arms long, sweep to thighs. Lats only."),
  X("chest-supported-db-row", "Chest-supported DB row", "back", "horizontal pull", "dumbbell", 2, 3, 8, 12, 90, "Chest on incline bench — zero lower-back load."),
  X("cable-shrug", "Cable shrug", "back", "horizontal pull", "cable", 5, 2, 12, 15, 60, "Straight up, pause at the top."),
  X("ohp-db", "Seated DB overhead press", "shoulders", "vertical press", "dumbbell", 2, 4, 6, 10, 150, "Bench upright, back supported. No lower-back arch."),
  X("ohp-bb", "Standing barbell press", "shoulders", "vertical press", "barbell", 2.5, 4, 6, 10, 150, "Glutes tight, ribs down. Bar over mid-foot."),
  X("lateral-raise", "DB lateral raise", "shoulders", "lateral raise", "dumbbell", 2, 3, 12, 15, 60, "Lead with elbows. 2kg jumps are big — reps first."),
  X("cable-lateral", "Cable lateral raise", "shoulders", "lateral raise", "cable", 5, 3, 12, 15, 60, "Constant tension. Cable behind the body."),
  X("face-pull", "Cable face pull", "shoulders", "rear delt", "cable", 5, 3, 12, 15, 75, "Pull to eye line, rotate knuckles back."),
  X("rear-delt-fly", "Cable rear-delt fly", "shoulders", "rear delt", "cable", 5, 2, 12, 15, 60, "Cross-body sweep, arms long."),
  X("db-rear-delt-fly", "DB rear-delt fly", "shoulders", "rear delt", "dumbbell", 2, 3, 12, 15, 60, "Chest on incline bench, sweep wide."),
  X("arnold-press", "Seated Arnold press", "shoulders", "vertical press", "dumbbell", 2, 3, 8, 12, 120, "Rotate palms through the press. Smooth tempo."),
  X("db-curl", "DB curl", "biceps", "curl", "dumbbell", 2, 3, 10, 12, 75, "No swing. Full lower every rep."),
  X("hammer-curl", "DB hammer curl", "biceps", "curl", "dumbbell", 2, 3, 10, 12, 75, "Neutral grip. Hits brachialis for arm thickness."),
  X("cable-curl", "Cable curl", "biceps", "curl", "cable", 5, 3, 10, 15, 75, "Constant tension, elbows pinned."),
  X("incline-db-curl", "Incline DB curl", "biceps", "curl", "dumbbell", 2, 3, 10, 12, 75, "Bench ~60°, arms hang back — big stretch."),
  X("triceps-pushdown", "Cable triceps pushdown", "triceps", "triceps extension", "cable", 5, 3, 10, 15, 75, "Elbows pinned, full lockout."),
  X("oh-triceps", "Overhead cable triceps ext.", "triceps", "triceps extension", "cable", 5, 3, 10, 15, 75, "Face away, full stretch behind head."),
  X("skullcrusher", "DB skullcrusher", "triceps", "triceps extension", "dumbbell", 2, 3, 10, 12, 75, "Lower to behind the head, not the face."),
  X("close-grip-bench", "Close-grip bench press", "triceps", "horizontal press", "barbell", 2.5, 3, 8, 12, 120, "Hands shoulder-width, elbows tucked."),
  X("box-squat", "Box squat to bench", "quads", "squat", "barbell", 2.5, 4, 8, 10, 150, "Sit back, shins near vertical. Depth per current phase.", {
  kneeGoverned: true
}),
  X("goblet-squat", "Goblet squat (to box)", "quads", "squat", "dumbbell", 2, 3, 10, 12, 120, "DB at chest. Box sets the depth honestly.", {
  kneeGoverned: true
}),
  X("split-squat-iso", "Split squat isometric hold", "quads", "lunge", "bodyweight", 2, 3, 20, 30, 90, "Seconds per leg, shallow bend. Hold DBs to load.", {
  isometric: true,
  perSide: true,
  kneeGoverned: true
}),
  X("split-squat", "DB split squat", "quads", "lunge", "dumbbell", 2, 3, 8, 12, 120, "Short stride, torso tall. Phase 2+.", {
  perSide: true,
  kneeGoverned: true
}),
  X("reverse-lunge", "DB reverse lunge", "quads", "lunge", "dumbbell", 2, 3, 8, 12, 120, "Step back, front shin vertical. Phase 3.", {
  perSide: true,
  kneeGoverned: true
}),
  X("tke", "Cable TKE / light leg extension", "quads", "knee extension", "cable", 5, 3, 15, 15, 60, "Slow, squeeze quad hard at lockout.", {
  kneeGoverned: true
}),
  X("step-up", "DB step-up (low box)", "quads", "lunge", "dumbbell", 2, 3, 8, 10, 120, "Low height, drive through the heel. Phase 3.", {
  perSide: true,
  kneeGoverned: true
}),
  X("wall-sit", "Wall sit", "quads", "squat", "bodyweight", 2, 4, 20, 40, 90, "Seconds. 30–45° bend, weight even both feet.", {
  isometric: true,
  kneeGoverned: true
}),
  X("rdl", "Barbell Romanian deadlift", "hamstrings", "hip hinge", "barbell", 2.5, 4, 6, 10, 150, "Hip hinge, soft knees, bar close. Minimal knee stress."),
  X("db-rdl", "DB Romanian deadlift", "hamstrings", "hip hinge", "dumbbell", 2, 3, 8, 12, 120, "Same hinge, DBs along the thighs."),
  X("sl-rdl", "Single-leg DB RDL", "hamstrings", "hip hinge", "dumbbell", 2, 3, 8, 10, 90, "Balance + hamstring. Hold cable frame if needed.", {
  perSide: true
}),
  X("cable-leg-curl", "Cable leg curl (ankle strap)", "hamstrings", "leg curl", "cable", 5, 3, 12, 15, 75, "Hamstring isolation is knee protection.", {
  perSide: true
}),
  X("hip-thrust", "Barbell hip thrust", "glutes", "hip thrust", "barbell", 2.5, 4, 8, 12, 120, "Upper back on bench, 2s squeeze, shins vertical."),
  X("cable-pullthrough", "Cable pull-through", "glutes", "hip hinge", "cable", 5, 3, 12, 15, 90, "Face away, hinge, snap hips through."),
  X("glute-bridge", "Heel-elevated glute bridge", "glutes", "hip thrust", "bodyweight", 2, 3, 10, 15, 75, "Heels up, 2s hold at top. Plate on hips to load."),
  X("hip-abduction", "Cable / side-lying hip abduction", "glutes", "abduction", "cable", 5, 3, 12, 15, 60, "Glute med — pelvic control protects the knee.", {
  perSide: true
}),
  X("calf-raise", "Standing calf raise", "calves", "calf raise", "dumbbell", 2, 3, 12, 15, 60, "Full stretch at the bottom, pause."),
  X("sl-calf-raise", "Single-leg calf raise", "calves", "calf raise", "dumbbell", 2, 3, 12, 15, 60, "Hold DB or cable handle for balance.", {
  perSide: true
}),
  X("deadbug", "Dead bug", "core", "anti-extension", "bodyweight", 2, 3, 10, 10, 60, "Slow. Lower back stays glued down.", {
  perSide: true
}),
  X("pallof", "Pallof press", "core", "anti-rotation", "cable", 5, 3, 10, 12, 60, "Resist the twist. Press and hold 2s.", {
  perSide: true
}),
  X("cable-crunch", "Kneeling cable crunch", "core", "anti-extension", "cable", 5, 3, 12, 15, 60, "Flex the spine, don’t pull with arms."),
  X("plank", "Plank", "core", "anti-extension", "bodyweight", 2, 3, 30, 60, 60, "Seconds. Glutes tight, ribs down.", {
  isometric: true
}),
  X("squeeze-press", "DB squeeze press", "chest", "horizontal press", "dumbbell", 2, 3, 8, 12, 90, "Press the DBs together hard through the whole rep."),
  X("single-arm-cable-press", "Single-arm cable press", "chest", "horizontal press", "cable", 5, 3, 10, 12, 75, "Split stance, brace — press without rotating.", {
  perSide: true
}),
  X("deep-pushup", "Deep push-up (hands on DBs)", "chest", "horizontal press", "bodyweight", 2, 3, 8, 15, 90, "Extra range at the bottom. Elevate feet to progress."),
  X("single-arm-cable-row", "Single-arm cable row", "back", "horizontal pull", "cable", 5, 3, 10, 12, 75, "Reach long at the front, drive elbow to hip.", {
  perSide: true
}),
  X("db-pullover", "DB pullover", "back", "vertical pull", "dumbbell", 2, 3, 10, 15, 90, "One DB, arms long overhead — big lat stretch."),
  X("cable-upright-row", "Cable upright row", "shoulders", "lateral raise", "cable", 5, 3, 10, 15, 75, "Wide grip, elbows lead, stop at chest height."),
  X("db-front-raise", "DB front raise", "shoulders", "lateral raise", "dumbbell", 2, 3, 12, 15, 60, "To eye height, alternate arms, no swing."),
  X("cable-y-raise", "Cable Y-raise", "shoulders", "lateral raise", "cable", 5, 3, 12, 15, 60, "Sweep up and out into a Y — lower traps too."),
  X("cable-ext-rotation", "Cable external rotation", "shoulders", "rear delt", "cable", 5, 2, 12, 15, 60, "Elbow pinned to side, rotate out slow — cuff health.", {
  perSide: true
}),
  X("concentration-curl", "Concentration curl", "biceps", "curl", "dumbbell", 2, 3, 10, 12, 60, "Elbow braced on thigh, full squeeze.", {
  perSide: true
}),
  X("spider-curl", "Spider curl (chest on bench)", "biceps", "curl", "dumbbell", 2, 3, 10, 12, 75, "Chest on incline, arms hang — zero swing possible."),
  X("single-arm-pushdown", "Single-arm cable pushdown", "triceps", "triceps extension", "cable", 5, 3, 12, 15, 60, "Palm down or neutral, full lockout.", {
  perSide: true
}),
  X("cable-kickback", "Cable triceps kickback", "triceps", "triceps extension", "cable", 5, 3, 12, 15, 60, "Hinge forward, upper arm still, snap to lockout.", {
  perSide: true
}),
  X("bench-dip", "Bench dip (feet forward)", "triceps", "triceps extension", "bodyweight", 2, 3, 8, 15, 90, "Shallow range. Skip if shoulders complain."),
  X("bulgarian-split-squat", "Bulgarian split squat", "quads", "lunge", "dumbbell", 2, 3, 8, 12, 120, "Rear foot on bench. Phase 3 only — big knee demand.", {
  perSide: true,
  kneeGoverned: true
}),
  X("good-morning", "Barbell good morning", "hamstrings", "hip hinge", "barbell", 2.5, 3, 10, 12, 120, "Light. Bar on back, hinge until hamstrings pull."),
  X("wide-db-rdl", "Wide-stance DB RDL", "hamstrings", "hip hinge", "dumbbell", 2, 3, 10, 12, 120, "Toes slightly out — adductors join the party."),
  X("cable-glute-kickback", "Cable glute kickback", "glutes", "hip thrust", "cable", 5, 3, 12, 15, 60, "Ankle strap, push back and up, squeeze 1s.", {
  perSide: true
}),
  X("cable-hip-adduction", "Cable hip adduction", "glutes", "abduction", "cable", 5, 3, 12, 15, 60, "Ankle strap, sweep across — inner thigh.", {
  perSide: true
}),
  X("seated-db-calf", "Seated DB calf raise", "calves", "calf raise", "dumbbell", 2, 3, 12, 20, 60, "DB on knee, ball of foot on a plate — soleus.", {
  perSide: true
}),
  X("tibialis-raise", "Tibialis raise (wall)", "calves", "calf raise", "bodyweight", 2, 3, 15, 25, 45, "Back to wall, heels down, lift toes — shin strength protects the knee."),
  X("cable-woodchop", "Cable woodchop", "core", "anti-rotation", "cable", 5, 3, 10, 12, 60, "High-to-low, arms long, rotate through the hips.", {
  perSide: true
}),
  X("side-plank", "Side plank", "core", "anti-rotation", "bodyweight", 2, 3, 20, 40, 60, "Seconds per side. Hips high, straight line.", {
  isometric: true,
  perSide: true
}),
  X("hollow-hold", "Hollow hold", "core", "anti-extension", "bodyweight", 2, 3, 20, 40, 60, "Seconds. Lower back pressed down, arms overhead to progress.", {
  isometric: true
}),
  X("farmer-carry", "DB farmer carry / hold", "core", "anti-rotation", "dumbbell", 2, 3, 30, 45, 90, "Seconds. Heavy DBs, tall posture, walk or hold.", {
  isometric: true
}),
  X("hanging-knee-raise", "Hanging knee raise", "core", "anti-extension", "bodyweight", 2, 3, 8, 12, 75, "From the pull-up bar. Slow, no swing."),
  // Gym-only (used on the gym leg day)
  X("leg-ext-iso", "Leg extension isometric hold", "quads", "knee extension", "machine", 5, 4, 30, 45, 90, "Seconds. Knee bent about 60 degrees, push steadily and hold. Pain stays at 3/10 or below.", { isometric: true, kneeGoverned: true }),
  X("leg-press", "Leg press", "quads", "squat", "machine", 5, 3, 10, 15, 90, "Feet mid platform, controlled depth, don't lock the knees out.", { kneeGoverned: true }),
  X("leg-extension", "Leg extension (machine)", "quads", "knee extension", "machine", 5, 3, 12, 15, 75, "Slow lower, squeeze at the top. Range your physio has cleared.", { kneeGoverned: true }),
  X("seated-leg-curl", "Seated leg curl (machine)", "hamstrings", "leg curl", "machine", 5, 3, 10, 15, 75, "Hips pinned, curl fully, 2 s lower."),
  X("hip-adduction-machine", "Hip adduction (machine)", "glutes", "abduction", "machine", 5, 2, 12, 15, 60, "Smooth squeeze in, no bouncing at the stretch."),
  // Knees over toes (Ben Patrick's Knee Ability Zero, low-load daily set)
  X("backward-walk", "Backward walk (cable or treadmill)", "quads", "locomotion", "cable", 5, 1, 5, 8, 30, "Low cable, handles at your hips, walk backwards 15 steps, walk back, repeat. Treadmill or a slope at the gym. Log minutes.", { unit: 'min' }),
  X("patrick-step", "Backward step-up (Patrick step)", "quads", "knees over toes", "bodyweight", 2, 2, 10, 20, 30, "Stand on a low step (start with a 20 kg plate flat). Lower the other heel to the floor in front, working knee travels over the toes. Hold a rail.", { perSide: true }),
  X("couch-stretch", "Couch stretch", "quads", "mobility", "bodyweight", 2, 1, 60, 90, 15, "Back knee against a wall or bench, front foot flat. Squeeze the back glute. Seconds per side.", { perSide: true, unit: 'sec' }),
  X("atg-split-squat", "ATG split squat", "quads", "knees over toes", "dumbbell", 2, 2, 5, 10, 90, "Long stride, front knee travels well past the toes, back knee down. Assist with a rail. Physio clearance first.", { perSide: true, kneeGoverned: true }),
  X("sa-pulldown", "Single-arm cable pulldown (kneeling)", "back", "vertical pull", "cable", 5, 3, 10, 15, 90, "Kneel facing the high pulley, pull elbow down to your ribs, slow return. Lets the 70 kg stack keep challenging you.", { perSide: true }),
  X("machine-calf-raise", "Standing calf raise (machine)", "calves", "calf raise", "machine", 5, 3, 12, 20, 60, "Full stretch at the bottom, pause at the top."),
]

export const byId = new Map(LIBRARY.map(e => [e.id, e]))
export const MUSCLES: Muscle[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']
export const exName = (id: string) => byId.get(id)?.name ?? id

export const unitOf = (e?: LibraryExercise): Unit => e?.unit ?? (e?.isometric ? 'sec' : 'reps')
/** Suffix after a number: "12", "45s", "5 min". */
export const unitSuffix = (e?: LibraryExercise) => ({ reps: '', sec: 's', min: ' min' })[unitOf(e)]
/** Word under the stepper and in targets. */
export const unitWord = (e?: LibraryExercise) => ({ reps: 'reps', sec: 'seconds', min: 'minutes' })[unitOf(e)]
/** How far one tap of the reps stepper moves. */
export const unitStep = (e?: LibraryExercise) => ({ reps: 1, sec: 5, min: 1 })[unitOf(e)]
