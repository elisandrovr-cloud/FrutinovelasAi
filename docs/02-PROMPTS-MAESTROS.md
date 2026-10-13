# 2. Prompts maestros

Los prompts viven en código (`apps/api/src/prompts/`) para versionarlos y probarlos. Este documento explica la intención de cada uno, las reglas que **no** deben romperse y muestra ejemplos reales generados por el pipeline.

| Prompt | Archivo | Modelo |
|---|---|---|
| Guionista (system) | `prompts/script.ts` → `SCRIPTWRITER_SYSTEM` | Claude `claude-opus-5-5` |
| Biblia de la historia | `prompts/script.ts` → `biblePrompt()` | Claude, effort `high` |
| Guion de capítulo | `prompts/script.ts` → `chapterPrompt()` | Claude, effort `medium` |
| ADN de personaje | `prompts/character.ts` → `buildCharacterDNA()` | (texto congelado) |
| Hoja de referencia / giro / expresiones | `prompts/character.ts` | FLUX 1.1 Pro Ultra / FLUX Kontext Multi |
| Imagen clave del plano | `prompts/video.ts` → `keyframePrompt()` | FLUX Kontext Multi |
| Movimiento (image→video) | `prompts/video.ts` → `videoMotionPrompt()` | Runway Gen-4 Turbo / Kling |
| Voz | `prompts/voice.ts` | ElevenLabs |
| Música | `providers/music/index.ts` → `MUSIC_PROMPTS` | Eleven Music / biblioteca |

---

## 2.1 Guion de frutinovela (Claude)

### Por qué en dos fases

1. **Biblia** (1 llamada): personajes con diseño visual y voz, escenarios reutilizables y escaleta de *todos* los capítulos con cliffhanger planificado. Así el arco completo (traición a mitad, falso final feliz, momento más oscuro, clímax) está diseñado antes de escribir diálogos.
2. **Capítulo N** (N llamadas encadenadas): guion plano a plano. Recibe la biblia, la escaleta del capítulo, un adelanto del N+1 (para sembrar sin revelar) y el **`endState` del N-1** (resumen, último fotograma, estado físico y emocional de cada personaje).

Ventajas: cada respuesta es pequeña y fiable, cada capítulo es editable/regenerable por separado, y “Generar solo el siguiente capítulo” es natural.

### Configuración de la llamada

```ts
client.beta.messages.stream({
  model: "claude-opus-5-5",
  max_tokens: 64000,                         // streaming → sin timeouts HTTP
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",                      // si el clasificador rechaza un falso positivo, la API reintenta con el modelo recomendado
  system: [{ type: "text", text: SCRIPTWRITER_SYSTEM, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: prompt }],
  output_config: { effort: "high", format: betaZodOutputFormat(StoryBibleSchema) },
});
const msg = await stream.finalMessage();     // msg.parsed_output ya validado por Zod
```

- **Salidas estructuradas**: el mismo esquema Zod (`packages/shared/src/schemas.ts`) define el JSON que devuelve Claude, valida las ediciones del usuario y tipa el frontend. Las restricciones que el JSON Schema no expresa (5 o 10 s, keys válidas) van en `.describe()` y se corrigen en `normalizeChapter()`.
- **Prompt caching**: el system prompt es idéntico byte a byte en las 9–13 llamadas de una novela.
- **`stop_reason`**: se comprueba `refusal` y `max_tokens` antes de leer el contenido.

### System prompt (resumen de reglas)

El texto completo está en `SCRIPTWRITER_SYSTEM`. Bloques:

- **Sello**: melodrama sin vergüenza (celos, gemelas malvadas, bodas interrumpidas, cachetadas), diálogos lapidarios con juegos de palabras frutales (“eres más ácida que un limón en ayunas”), humor involuntario porque *los personajes se lo toman muy en serio*, cliffhanger en cada capítulo, apto para todo público.
- **Reglas de producción** (porque el guion alimenta modelos de video):
  - Planos de **5 o 10 s**, una acción física clara y animable por plano.
  - **Máximo 3 personajes** en pantalla; 1–2 en primeros planos (el lip-sync funciona con un hablante).
  - **2,3 palabras por segundo** como máximo → ~11 palabras en un plano de 5 s, ~23 en uno de 10 s. Réplicas largas → plano/contraplano.
  - Solo escenarios de la biblia; SFX concretos; música por escena con 8 emociones.
- **Consistencia**: nombres, keys, vestuarios y personalidades son canon; un cambio de vestuario solo si la trama lo exige y anotado en `endState`.

### Prompt de biblia (variables)

`biblePrompt({prompt, genres, chapterCount, totalMinutes, accent, aspectRatio})` añade:

- Catálogo de frutas con su anatomía fija y arquetipos (piña = celosa intensa / matriarca; mango = galán; limón = suegra amargada…).
- 4–7 personajes con silueta y paleta distinguibles (**dos personajes nunca comparten paleta dominante**) y vestuario simple e icónico (colores sólidos, 1–3 accesorios fijos) → fácil de reproducir por IA.
- `visual.promptEn` y `sets[].promptEn`: la misma descripción **en inglés** (FLUX, Runway y Kling siguen mejor el inglés), mientras guion y diálogos quedan en español latino.
- Estructura dramática obligatoria: conflicto en los primeros 20 s del cap. 1, traición y secreto a mitad, falso final feliz, momento más oscuro en el penúltimo, epílogo con giro cómico.

### Prompt de capítulo (variables)

`chapterPrompt({bible, outline, previous, targetSeconds, totalChapters})`:

- **Bloque de continuidad obligatoria** con el `endState` previo; el primer plano debe arrancar en el mismo escenario, posiciones y emociones del último fotograma, y resolver o prolongar el cliffhanger.
- `recap` de narrador (≤25 palabras) desde el capítulo 2 → se narra sobre la cartela de apertura.
- Duración: suma de planos entre 90 % y 110 % del objetivo (`totalMinutes·60 / capítulos`).
- `visualPromptEn` por plano: 30–60 palabras en inglés, citando a los personajes por su KEY en mayúsculas (`PINA_PALOMA`), que es exactamente como aparecen en el ADN y en el prompt de la imagen clave.
- `endState.lastFrame` preciso, porque **será la imagen inicial del siguiente capítulo**.

---

## 2.2 Diseño de personajes consistentes (FLUX)

### ADN del personaje (texto congelado)

Se construye una vez por versión y se guarda en `CharacterVersion.dnaPrompt`. Ejemplo real:

```text
[PINA_PALOMA] anthropomorphic pineapple character. tall slender anthropomorphic pineapple, golden diamond-pattern skin (#F4C430), crown of seven spiky dark-green leaves styled like a high ponytail, huge amber eyes with long curled lashes, arched expressive eyebrows, glossy red lips. Color palette: #F4C430, #2E8B57, #8B5A2B. ALWAYS wears: fitted crimson satin dress with puffed shoulders. Fixed accessories: gold hoop earrings, pearl necklace.
```

Reglas:
- **Etiqueta `[KEY]`** al inicio: el prompt del plano se refiere al personaje con ese mismo token.
- **Hex de la paleta** explícitos (los modelos respetan mejor “#F4C430” que “amarillo”).
- **“ALWAYS wears”** + accesorios fijos: el vestuario es lo primero que derivan los modelos de video.
- Sin nombres propios ni emociones en el ADN (la emoción va en cada plano).

### Hoja de referencia (texto → imagen, semilla fija)

```text
Character design reference, single character, full body, standing in a relaxed confident 3/4 front pose, centered, plain light gray studio background (#E9E6E1), soft even three-point lighting, entire body visible from head (including leaves/stem) to feet. {DNA} Neutral-friendly expression showing the face clearly. {STYLE_LOCK}
```

Parámetros: `FLUX 1.1 Pro Ultra`, `aspect_ratio 3:4`, `seed = derive(masterSeed, "char", key, versión)`.
Fondo neutro y luz plana a propósito: la referencia se reutiliza como input en cada plano y no debe “contaminar” la iluminación de la escena.

### Hoja de giro y hoja de expresiones (edición desde la referencia)

Modelo de edición (`FLUX Kontext Max Multi`) con `image_urls = [referencia]`:

```text
Using the character in the reference image, create a character turnaround model sheet: the exact same character shown 4 times in a row — front view, 3/4 view, side profile, back view — same scale, same lighting, plain light gray background. Keep design, proportions, colors, outfit and accessories IDENTICAL to the reference. {DNA} {STYLE_LOCK}
```

```text
Using the character in the reference image, create a 3x3 facial expression sheet, head and shoulders, plain light gray background: 1 joyful laughing, 2 crying with huge tears, 3 furious shouting, 4 jealous side-eye with raised eyebrow, 5 shocked gasp with hand on mouth, 6 lovestruck with sparkling eyes, 7 sarcastic smirk, 8 terrified, 9 dramatic fainting. The character must be IDENTICAL in every panel … {DNA} {STYLE_LOCK}
```

### Rediseño a mitad de historia

Al editar vestuario/accesorios se crea una versión nueva **con la misma semilla** y la referencia se genera por **edición de la referencia anterior**:

```text
Same character as the reference image, keep face, body shape and identity, but update the design to: {DNA nuevo}. …
```

Así cambia la ropa pero la cara sigue siendo la misma. “Regenerar” (otra semilla, desde cero) es la opción opuesta: diseño totalmente nuevo antes de aprobar.

### Style lock (idéntico en todas las imágenes y videos)

```text
3D animated feature film still, Pixar / DreamWorks quality, soft global illumination, subsurface scattering on fruit skin, vibrant saturated tropical colors, warm cinematic color grade with teal shadows, shallow depth of field, anthropomorphic fruit characters with big glossy expressive eyes with catchlights, exaggerated telenovela facial expressions, thin cartoon arms and legs in the fruit's color, white cartoon gloves, clean stylized materials, no text, no watermark, no real humans
```

Negativo (Kling acepta `negative_prompt`): `photorealistic, live action, real humans, … outfit change, different colors, different character design, inconsistent proportions`.

---

## 2.3 Generación de video manteniendo consistencia (Runway / Kling)

**Regla de oro: nunca texto→video.** Siempre *imagen clave → video*. La imagen clave fija apariencia, vestuario, escenario y luz; el prompt de video solo describe movimiento.

### Paso 1 — imagen clave (FLUX Kontext Multi)

Inputs, en orden de prioridad (máx. 4 imágenes): `[continuidad (último fotograma del capítulo previo o imagen clave del plano previo), referencias de los personajes en pantalla, referencia del escenario]`. Ejemplo real (primer plano de un capítulo):

```text
Compose ONE cinematic frame from an animated telenovela. medium close-up.
Location: Salón de la Hacienda.
CONTINUITY: this frame continues directly from image 1; keep the same positions, props, lighting and emotional state. Previous chapter ended on: close-up of PINA_PALOMA gasping at the hacienda door.
Lighting: moody blue moonlight with warm practical lamps, weather: tormenta tropical.
Action: PINA_PALOMA storms through the doorway and stops in front of MANGO_ALEJANDRO, pointing an accusing finger at him, tears welling in her eyes; MANGO_ALEJANDRO steps back, hands raised, guilty face.
Cast (keep each design EXACTLY as in its reference image, same colors, outfit and accessories):
PINA_PALOMA = the character in image 2: [PINA_PALOMA] anthropomorphic pineapple character. …
MANGO_ALEJANDRO = the character in image 3: [MANGO_ALEJANDRO] anthropomorphic mango character. …
Only the listed characters appear. Each character appears once.
{STYLE_LOCK}
```

Semilla: `derive(masterSeed, "shot", capítulo, orden)` → regenerar un plano da el mismo resultado salvo que cambie el prompt.

### Paso 2 — movimiento (image-to-video)

Runway (`POST /v1/image_to_video`, `model: gen4_turbo`, `promptImage`, `ratio 720:1280 | 1280:720`, `duration 5|10`, `seed`) o Kling (`POST /v1/videos/image2video`, `mode: pro`, `cfg_scale 0.6`, `negative_prompt`). Prompt ≤ 950 caracteres:

```text
fast telenovela crash zoom into the face. PINA_PALOMA storms through the doorway and stops in front of MANGO_ALEJANDRO, pointing an accusing finger at him, tears welling in her eyes; MANGO_ALEJANDRO steps back, hands raised, guilty face. PINA_PALOMA talks expressively with clear mouth movements. Exaggerated cartoon acting, smooth fluid 3D animation, consistent character design, outfits and colors identical to the first frame, no new characters, no text.
```

Plantilla: `{movimiento de cámara}. {acción}. {quién habla}. {cláusula de consistencia}`.

Mapa de cámaras (`CAMERA` en `prompts/video.ts`):

| Guion | Encuadre (imagen clave) | Movimiento (video) |
|---|---|---|
| plano_general | wide establishing shot | slow cinematic push-in |
| primer_plano | close-up on the face | slow dolly-in |
| primerisimo_primer_plano | extreme close-up on the eyes | very slow dramatic zoom-in |
| zoom_dramatico | medium close-up | fast telenovela crash zoom into the face |
| contrapicado | low-angle shot looking up | slow tilt up |
| travelling | medium-wide tracking shot | smooth lateral tracking following the action |

Buenas prácticas:
- Una acción por plano; si el guion pide dos, divide el plano.
- Evita describir de nuevo colores o ropa en el prompt de video (compite con la imagen y produce deriva).
- Moderación: “cachetada” → describe como *cartoon slap with comic stars*; el pipeline cae a Ken Burns si el proveedor rechaza el plano.

### Paso 3 — lip-sync (Sync Labs)

Solo cuando hay **un único hablante en pantalla**: `POST https://api.sync.so/v2/generate` con `model: lipsync-2`, `input: [{type:"video",url},{type:"audio",url}]`. Requiere URLs públicas (R2/S3).

---

## 2.4 Voces con ElevenLabs

- **Selección automática** (`assignVoices`): puntúa las voces de tu biblioteca (`GET /v1/voices`) por género (palabra completa), edad, acento (mexicano, colombiano, caribeño…) y timbre; ninguna voz se repite entre personajes. Puedes fijar un catálogo propio con `ELEVENLABS_VOICE_CATALOG` y la voz del narrador con `NARRATOR_VOICE_ID`.
- **Ajustes base** por personaje (`stability 0.40, similarity_boost 0.80, style 0.45`) editables desde la UI.
- **Modulación por entrega** (`settingsForLine`):

| Entrega | Δ stability | Δ style | Tag v3 |
|---|---|---|---|
| grito | −0.20 | +0.35 | `[shouting]` |
| sollozo | −0.25 | +0.30 | `[sobbing]` |
| susurro | +0.15 | −0.10 | `[whispers]` |
| risa | −0.15 | +0.25 | `[laughs]` |
| sarcástico | −0.05 | +0.20 | `[sarcastic]` |
| temblorosa | −0.20 | +0.20 | `[trembling voice]` |
| solemne | +0.15 | +0.10 | `[solemnly]` |

- **Texto**: con `eleven_v3` se antepone el audio tag; con `eleven_multilingual_v2` se refuerza con puntuación (`¡…!`, `...`), a la que el modelo es muy sensible.
- **Prosodia encadenada**: cada petición envía `previous_text` (réplica anterior, aunque sea de otro plano) y `next_text`, así la escena suena como una conversación y no como líneas sueltas.
- **Semilla** por personaje: regenerar una línea da la misma lectura.

Ejemplo real (`delivery: grito`, base por defecto):

```json
POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128
{
  "text": "¡¿Cómo pudiste hacerme esto… a mí, que te di mi corona?!",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": { "stability": 0.2, "similarity_boost": 0.8, "style": 0.8, "use_speaker_boost": true },
  "previous_text": "Tú no sabes nada de mi corazón.",
  "seed": 1432553321
}
```

SFX: `POST /v1/sound-generation` con `"{sfx}, cartoon telenovela sound effect"`.

---

## 2.5 Música de telenovela

Una pista por emoción **por novela**, generada una vez y reutilizada (leitmotiv). Prompts (`MUSIC_PROMPTS`):

- **dramática**: Latin American telenovela dramatic theme, sweeping strings, timpani hits, piano ostinato, big orchestral stabs, 90s Televisa style, instrumental
- **romántica**: Romantic telenovela love theme, nylon guitar, soft strings, bolero feel, tender piano melody, instrumental
- **suspenso**: Suspense telenovela underscore, pizzicato strings, low drones, ticking percussion, mysterious, instrumental
- **revelación**: Shocking revelation sting then dramatic orchestral swell, gong, choir pad, telenovela reveal, instrumental
- (y comedia, tristeza, tensión, felicidad)

En el montaje la música baja automáticamente bajo los diálogos (`sidechaincompress`) y todo se normaliza a −14 LUFS (estándar de TikTok/YouTube).
