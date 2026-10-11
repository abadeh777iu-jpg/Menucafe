/* Illustrated occasion registry. Each entry owns its composition and motion.
   SVGs are local, decorative and clipped to a dedicated area, never a food card.
   Add future occasions here without changing the menu repository or card renderer. */
(() => {
  const blossom = (x,y,s=1) => `<g transform="translate(${x} ${y}) scale(${s})"><g fill="#f2c5bf" stroke="#bd807c" stroke-width=".7"><ellipse cy="-7" rx="5" ry="8"/><ellipse cy="-7" rx="5" ry="8" transform="rotate(72)"/><ellipse cy="-7" rx="5" ry="8" transform="rotate(144)"/><ellipse cy="-7" rx="5" ry="8" transform="rotate(216)"/><ellipse cy="-7" rx="5" ry="8" transform="rotate(288)"/></g><circle r="3.3" fill="#b89044"/></g>`;
  const seed=(x,y)=>`<path d="M${x} ${y}c-7 5-5 11 0 11s7-6 0-11Z" fill="#bc3d4a"/>`;
  const sprigs=Array.from({length:15},(_,i)=>`<path d="M${177+i*3} 225q${i%2?'-':' '}${10+i%5} -34 ${i%2?-8:7} -${37+i%4*6}"/>`).join('');
  const rim=Array.from({length:16},(_,i)=>`<path d="m${61+i*24} 295 9 6-9 6-9-6Z"/>`).join('');
  const scene=(id,body,caption)=>`<figure class="hero-art occasion-scene scene-${id}"><svg viewBox="0 0 500 350" fill="none" aria-hidden="true" focusable="false">${body}</svg><figcaption>${caption}</figcaption></figure>`;
  const nowruz=scene('nowruz',`
    <defs><linearGradient id="spring-sky" x1="250" y1="30" x2="250" y2="300" gradientUnits="userSpaceOnUse"><stop stop-color="#e5ecd7"/><stop offset="1" stop-color="#f6ebcf"/></linearGradient><pattern id="spring-tile" width="24" height="24" patternUnits="userSpaceOnUse"><path d="m12 2 10 10-10 10L2 12Z" stroke="#bdbf94" stroke-width=".6"/><circle cx="12" cy="12" r="2" fill="#bdbf94"/></pattern></defs>
    <path d="M42 301V128C42 7 458 7 458 128v173Z" fill="url(#spring-sky)"/>
    <path d="M53 295V129C53 21 447 21 447 129v166" stroke="#b8bd91"/><path d="M64 293V133C64 36 436 36 436 133v160" stroke="#fff8e6" stroke-width="3"/>
    <circle cx="346" cy="92" r="31" fill="#eee0a5"/><circle cx="346" cy="92" r="24" stroke="#e3cf8c"/>
    <path d="M39 265q87-45 137-5t123 3 162-27v62H39Z" fill="#c8d6b3"/>
    <path d="M44 285q94-38 199-9t217-2v31H44Z" fill="#b7c6a0"/>
    <g class="motion-sway" style="transform-origin:70px 268px"><path d="M67 271C93 223 46 148 107 69M81 177q-42-20-56-60m52 73 55-55M86 107l65-33" stroke="#697e59" stroke-width="3" stroke-linecap="round"/>
    <path d="M79 218q-40-5-41-26 30-5 41 26ZM88 140q31-8 28-28-27-1-28 28ZM71 168q-25-15-32-7 9 19 32 7Z" fill="#8fa174"/>
    ${blossom(108,68,1.15)}${blossom(147,75,.78)}${blossom(129,132,.9)}${blossom(25,116,.9)}${blossom(74,191,.65)}${blossom(83,107,.7)}</g>
    <path d="M102 278h313l26 36H75Z" fill="#f7eddb" stroke="#c6b78d"/>
    <path d="M106 282h304l15 26H91Z" fill="url(#spring-tile)"/>
    <ellipse cx="257" cy="280" rx="159" ry="13" fill="#a9a27c" opacity=".18"/>
    <!-- Mirror and candle: a still-life inspired by the Haft-sin table. -->
    <path d="M246 255V131c0-55 83-55 83 0v124Z" fill="#bb9d5b" stroke="#927542" stroke-width="2"/>
    <path d="M254 250V133c0-44 67-44 67 0v117Z" fill="#d4e4d7" stroke="#f1dda5" stroke-width="3"/>
    <path d="m263 221 48-77m-47 39 36-53" stroke="#eef5e7" stroke-width="6" opacity=".8"/>
    <path d="M242 262h92l-8-10h-76Z" fill="#ab884f"/>
    <rect x="347" y="195" width="15" height="67" rx="3" fill="#f8f0d8" stroke="#d4c499"/><path d="M338 266h33m-26 4h19" stroke="#b59652" stroke-width="3"/>
    <path class="motion-flame" d="M354 172c-16 20-5 30 1 27 12-5 1-13-1-27Z" fill="#d7a64d"/>
    <!-- Sabzeh in a turquoise ceramic bowl. -->
    <g stroke="#708c43" stroke-width="2.2" stroke-linecap="round">${sprigs}</g>
    <path d="M161 224h74q-4 36-36 36t-38-36Z" fill="#4d8e83" stroke="#32685f"/>
    <ellipse cx="198" cy="224" rx="37" ry="5" fill="#7c9d55"/><path d="M170 235q27 11 56 0m-46 10 4 7m15-5v8m15-9-3 7" stroke="#d9e6c7" stroke-width="1.5"/>
    <!-- Hyacinth, apples and painted eggs. -->
    <path d="M121 252h24l-4 27h-17Z" fill="#eee7d3" stroke="#b9a882"/><path d="M133 253v-55m0 44q-18-1-15-18m15 27q18-3 18-20" stroke="#63814b" stroke-width="2"/>
    <g fill="#b098bd">${Array.from({length:11},(_,i)=>`<ellipse cx="${128+i%3*5}" cy="${201+Math.floor(i/3)*8}" rx="5" ry="5"/>`).join('')}</g>
    <ellipse cx="271" cy="279" rx="33" ry="6" fill="#c6ac77"/><path d="M247 265c-7-23 20-28 24-9 7-18 30-13 23 9-7 20-17 15-23 15s-17 5-24-15Z" fill="#b8554c"/><path d="m271 254 3-13m-2 9q13 2 13-9-10-4-13 9Z" stroke="#67834e" fill="#81965b" stroke-width="2"/>
    <ellipse cx="374" cy="282" rx="32" ry="6" fill="#ceb98e"/><ellipse cx="364" cy="272" rx="10" ry="15" transform="rotate(-18 364 272)" fill="#f0dcc4" stroke="#bc8d78"/><path d="m357 268 11 9m-9-15 12 9" stroke="#b77f79"/><ellipse cx="385" cy="272" rx="10" ry="15" transform="rotate(21 385 272)" fill="#d2dfc6" stroke="#8d9e78"/><path d="m378 272 12-4m-10 11 12-4" stroke="#8d9e78"/>
    <g fill="#f0c5bc" class="motion-petals"><ellipse cx="181" cy="99" rx="4" ry="7" transform="rotate(30 181 99)"/><ellipse cx="407" cy="166" rx="4" ry="7" transform="rotate(-25 407 166)"/><ellipse cx="154" cy="166" rx="3" ry="5"/></g>
    <path d="M55 322h390" stroke="#bab589"/><circle cx="250" cy="328" r="2" fill="#9b9e6c"/>
  `,'سفرهٔ هفت‌سین، شکوفه و شروعی دوباره');
  const yalda=scene('yalda',`
    <defs><linearGradient id="yalda-sky" x1="250" y1="0" x2="250" y2="320" gradientUnits="userSpaceOnUse"><stop stop-color="#1b3643"/><stop offset="1" stop-color="#244047"/></linearGradient><pattern id="yalda-weave" width="32" height="22" patternUnits="userSpaceOnUse"><path d="m16 1 14 10-14 10L2 11Z" stroke="#d49c6e" stroke-width=".7"/><path d="m16 7 5 4-5 4-5-4Z" fill="#d49c6e" opacity=".6"/></pattern></defs>
    <path d="M46 309V116Q46 40 174 40Q208 40 250 11Q292 40 326 40Q454 40 454 116v193Z" fill="url(#yalda-sky)" stroke="#937b51"/>
    <path d="M56 301V117q0-67 116-67 40 0 78-27 38 27 78 27 116 0 116 67v184Z" stroke="#b49357" stroke-opacity=".5"/>
    <circle cx="338" cy="94" r="30" fill="#dfc88c"/><circle cx="349" cy="85" r="28" fill="#203b47"/>
    <g class="motion-stars" fill="#cbb077">${[[100,95],[151,66],[202,119],[277,69],[389,157],[403,85],[81,163],[270,137]].map(([x,y])=>`<path d="m${x} ${y-4} 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/>`).join('')}</g>
    <g fill="#ccb789" opacity=".6"><circle cx="129" cy="132" r="1"/><circle cx="228" cy="75" r="1"/><circle cx="371" cy="62" r="1.5"/><circle cx="315" cy="153" r="1"/></g>
    <path d="M38 282h424v36H38Z" fill="#843e47"/><path d="M40 285h420v29H40Z" fill="url(#yalda-weave)"/><path d="M36 318h428" stroke="#c8a86b"/>
    <g stroke="#a9855a" stroke-width="1.3">${rim}</g>
    <!-- Watermelon on a brass platter. -->
    <ellipse cx="308" cy="277" rx="79" ry="9" fill="#b9955d"/>
    <path d="M230 198h155a78 78 0 0 1-155 0Z" fill="#54755d" stroke="#a1b385" stroke-width="1.2"/>
    <path d="M238 198h139a70 70 0 0 1-139 0Z" fill="#e0d4ac"/>
    <path d="M246 198h123a62 62 0 0 1-123 0Z" fill="#c96668"/>
    <g fill="#593c43">${[[265,214],[287,226],[313,236],[339,216],[308,209],[284,247],[334,242]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="2.2" ry="4" transform="rotate(${x%30-15} ${x} ${y})"/>`).join('')}</g>
    <!-- Whole and opened pomegranates. -->
    <ellipse cx="157" cy="280" rx="70" ry="10" fill="#b9955d"/>
    <path d="m130 195-9-16 12 3 7-10 7 10 11-3-8 16" fill="#ac4855" stroke="#d28c89"/>
    <path d="M140 194c-50-17-62 76-8 81 58 8 65-95 8-81Z" fill="#a44352" stroke="#d28c89"/><path d="M118 210q-16 20-4 42" stroke="#c66b73" stroke-width="3" stroke-linecap="round"/>
    <path d="M181 218c-32-10-52 54-11 61 49 8 58-65 11-61Z" fill="#d99b8e" stroke="#9d3b4c" stroke-width="3"/>
    <path d="M181 227c-25-5-36 38-8 44 34 5 41-47 8-44Z" fill="#efd4b1"/>
    ${[[171,235],[184,232],[194,241],[162,247],[178,245],[189,254],[172,257]].map(p=>seed(...p)).join('')}
    <!-- Candle and a closed book, an allusion to a Yalda gathering. -->
    <rect x="92" y="163" width="15" height="70" rx="2" fill="#e5d3a7"/><path d="M99 232v23m-14 6h29m-21-3h13" stroke="#bc995d" stroke-width="3"/>
    <path class="motion-flame" d="M99 139c-13 17-9 28 0 26 10-2 9-11 0-26Z" fill="#e8be70"/>
    <path d="m364 261 51-10 25 15-51 12Z" fill="#cfb186"/><path d="m364 261 1 12 25 14 50-11v-10l-51 12Z" fill="#e2ceb0"/><path d="m365 274 25 15 52-11" stroke="#b27059" stroke-width="3"/>
    <path d="M391 260h14m-7-3 10 6" stroke="#8e6947"/>
    <path d="M406 185c-8-16-7-34 0-47m-1 21 14-11m-14 24-14-11" stroke="#9d9b73" stroke-width="1.4"/>
    <path d="m419 148-1-11-9 5m-17 19-10-5 2 10" stroke="#9d9b73"/>
  `,'انار، هندوانه و گرمای یک دورهمی');
  window.OccasionVisuals = Object.freeze({
    nowruz: Object.freeze({name:'نوروز و بهار', hint:'سفرهٔ نو، شکوفهٔ نو', symbol:'✿', version:2, art:nowruz, kicker:'جشنِ نو شدن', title:'بهار، مهمانِ سفرهٔ ماست', subtitle:'به طعم‌های آشنا، با حال‌وهوایی تازه خوش آمدید.', signature:'نوروزتان پیروز', motif:'blossom', motion:true}),
    yalda: Object.freeze({name:'شب یلدا', hint:'انار، هندوانه و خاطره', symbol:'☾', version:2, art:yalda, kicker:'به بلندای یک خاطره', title:'یلدا؛ یک دقیقه بیشتر کنار هم', subtitle:'شبی برای مزه‌مزه کردن لحظه‌های گرمِ باهم بودن.', signature:'یلدایتان گرم و روشن', motif:'pomegranate', motion:true})
  });
})();
