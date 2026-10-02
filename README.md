# Blattodea — locomotion study

Interactive Three.js insect locomotion study with a stable overhead camera. Two specimens share one controller: an American cockroach and a common wasp (*Vespula vulgaris*).

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` creates the production bundle; `npm run preview` serves it.

## Controls

- Cockroach / Wasp tabs (top right): switch specimen in place; the choice is remembered locally
- W / ↑: forward; S / ↓: slow reverse
- A / ← and D / →: turn, including on the spot
- The cockroach walks at its sprint pace; hold Shift to double it. Hold C for cautious walking
- Hold G (wasp): contract and curl the abdomen and extend the sting; release to sheathe it
- Press F to fly (all three insects): wings open and beat, the insect lifts off and climbs on its own to the maximum height, where it hovers. Press F again at any time, including mid take-off, to land: it drops quickly, touches down with a small bounce on its legs (deeper after a faster descent) and folds its wings. The arrows fly forward, back and turn, much faster than walking (about 40 for the wasp, 23 for the cockroach and 14 for the mantis), with stronger acceleration in the air
- Take-off takes 1 s for the cockroach, 0.6 s for the mantis and 0.3 s for the wasp. In the air the legs hang a little lower, still bent, and trail against every turn, speed change and climb. The body floats gently up and down
- The camera rises with the insect, so the ground, grid and shadow shrink as it climbs and pulse subtly with the float. The sun steepens with altitude to keep the shadow in view
- Scroll: zoom
- The ground is endless: the floor and grid are a patch that follows the camera (the floor snaps to its texture tile and the grid is drawn from world coordinates, so neither slides), and fog hides the rim
- The key legend at the bottom lists only each insect's own commands (mantis D, F, C, G; cockroach F, C, Shift; wasp F, C, G)
- The gait panel on the left shows a black top-down silhouette of the current insect, rendered from the model itself at start-up, with each leg's contact dot on its foot (the cockroach and mantis are framed on body and legs, so their long antennae are cropped)

## Implementation

`src/simulation.js` separates the controller, tripod scheduler, leg IK, locomotion, antenna and idle systems. Stance feet remain in world coordinates. Swing footholds are predicted from linear and angular velocity, so inner and outer legs travel different distances during turns. Two-bone IK articulates each leg between its coxa and ankle. Antennae have independent phase, randomized sweep targets, and 38 tapered segments each.

`src/cockroach.js` and `src/wasp.js` each build one specimen and pose it every frame from the shared controller and tripod gait; `src/parts.js` holds shared mesh helpers. `src/main.js` renders the scene, switches specimens and connects keyboard/UI controls. The camera follows position with damping and has fixed orientation. The floor has procedural grain, a subtle grid and dynamic shadows.

This is a kinematic visual simulation inspired by cockroach locomotion, not a validated dynamics model. Ground is planar, with no obstacle collision or climbing. Wing beating is a grounded display, not flight. The exposed abdomen has nine glossy segmented plates; the four membranes have branching vein textures, flexible edges, and phase-offset 37.3 Hz motion. Parameter extremes can produce less plausible motion.

The wasp is modelled from a dorsal reference photograph, with every pattern painted procedurally in each surface's own coordinates:
- **Head:** black vertex with three ocelli, large faceted compound eyes, yellow face and mandibles.
- **Thorax:** glossy black, with yellow shoulder stripes and scutellum, metanotum and propodeum spots.
- **Abdomen:** a narrow petiole, then six chained, telescoping tergites with black anchor bands and lateral spots. The abdomen pumps as it breathes, flicks occasionally and swings into turns. Holding G raises the wasp on its legs; the tergites telescope and curl under, and a tapered stinger slides out, jabs and beads a venom droplet.
- **Legs:** spindle-shaped segments, swollen in the middle and narrowing into each joint; black coxae and femoral bases, amber tibiae with spurs, and five-part tarsi with a fat ring at each joint, the last segment darker orange and ending in a tiny curved claw hook.
- **Antennae:** elbowed, tapping the ground while walking.
- **Wings:** veined and iridescent. They fold into narrow strips along the abdomen at rest, and hooked hindwings beat with the forewings.
- **Setae:** fine hairs over the whole body, baked into static meshes.

The wasp is drawn at 75% of its modelled size. Leg lengths, stride, foot lift and step reach scale with it, so it takes shorter, quicker steps than the cockroach.

## Checks

`npm test` checks IK segment lengths, acceleration/braking/reverse/turning, tripod phase separation and stance-foot stability. `node tests/browser-check.js` checks the running local app in headless Chrome on macOS, exercises controls and tuning on both specimens (including switching tabs), and saves screenshots in `tests/`.

## Sound

Sound starts after the first keyboard or pointer interaction. Footfalls come from the three recordings in `Sounds/`: on load each is sliced into individual tarsal taps (about 70 in all) and ranked by loudness. Each planted-foot transition plays one tap, switching to a different recording every time so all three mix evenly, and the tap rhythm follows the tripod gait. Scuttling draws from the lighter taps; as speed rises toward a sprint, it shifts to heavier strikes, louder and slightly faster, with random variation and no immediate repeats. Until the recordings decode, short synthesized clicks stand in. On the wasp the same taps play quieter and brighter, for its lighter feet. Flying brings in broadband wing flutter modulated at the animated wing rate, with a soft harmonic undertone. The cockroach's wing sound is synthesized. Flying the wasp plays the hornet recording in `Sounds/` instead. It is trimmed and looped with a crossfaded seam, fades in with the wings and spins up in pitch as they open. A synthesized buzz stands in only until the recording decodes. Sound stops on tab hiding or window blur. Sound is always on; a previously saved volume level is still used.

## Praying mantis

Choose Mantis in the specimen tabs. W/S or Up/Down move; A/Left turns left and Right Arrow turns right. C slows movement and draws the forelegs in close to each other, also while the wings are held open with D (the wings stay open). The forelegs are drawn beneath the head, never over it. Press D to open the wings outward by 90 degrees and raise the forelegs; while held open the wings keep making small movements, alternating slow sways, quick flutter bursts and near-stillness. Press D again to fold them. Press F to fly (see Controls); its 47 Hz wingbeats blur into faint stroke ghosts, as on the wasp. Wing shadows follow the wings: solid when closed and lighter when open or beating (an ordered dither in the shadow pass, softened by the shadow filter). Press G for a 0.3-second strike: the forelegs shoot forward and converge, the tibiae snap shut, and the arms fold straight back to rest while a green waist keeps the lunging torso joined to the abdomen. D is reserved for the mantis wing display. Cockroach and wasp controls are unchanged. Four planted walking legs use IK, while the two spined forelegs remain raised. The model includes an elongated prothorax, triangular mobile head, lateral eyes, independent antennae, and overlapping green veined wings. The cuticle is clearcoated like the wasp's. The pronotum ends in a rounded, slightly pointed lobe that ends right where the head begins. The abdomen is a smooth, rounded, glossy body with a wet sheen and eight shallow segment sutures, sized to sit entirely inside the closed tegmina. The tegmina are opaque when closed and turn translucent as they open, densest at their margins and thinnest in the middle; the hindwings are translucent in the same way, and their pleats gather toward their veins as they fold under the covers. The forelegs carry a subtle row of fine pale setae along their outer edges. Two jointed cerci grow from the abdominal tip; they drift, twitch now and then, and swing slightly into turns. Existing cockroach and wasp models remain separate.

`/tests/mantis-smoke.html` on the dev server checks foreleg attack/recovery, four-legged locomotion, wing opening/folding, finite foot targets, and reset in a browser.
