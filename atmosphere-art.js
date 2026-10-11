/* Three local art directions. Scenery complements, never substitutes for,
   the continuously animated Canvas atmosphere in atmosphere-effects.js. */
(() => {
 const scene=(id,body,caption)=>`<figure class="hero-art occasion-scene scene-${id}"><svg viewBox="0 0 560 390" fill="none" aria-hidden="true" focusable="false">${body}</svg><figcaption>${caption}</figcaption></figure>`;
 const summer=scene('summer',`
 <defs><linearGradient id="sea-gradient" x1="280" y1="140" x2="280" y2="340" gradientUnits="userSpaceOnUse"><stop stop-color="#63bdbd"/><stop offset="1" stop-color="#117f89"/></linearGradient><radialGradient id="sun-halo"><stop stop-color="#fff2b2" stop-opacity=".8"/><stop offset="1" stop-color="#efd18a" stop-opacity="0"/></radialGradient><clipPath id="sea-clip"><path d="M35 60h490v275H35Z"/></clipPath></defs>
 <circle class="atmos-motion summer-sun" cx="353" cy="98" r="80" fill="url(#sun-halo)"/><circle cx="353" cy="98" r="33" fill="#f1cd6c"/><circle cx="353" cy="98" r="42" stroke="#ddb860" stroke-opacity=".45"/>
 <path d="M37 185q142-12 268 3t218-2v139H37Z" fill="url(#sea-gradient)"/>
 <g clip-path="url(#sea-clip)"><g class="atmos-motion summer-waves" stroke="#c5f0de" stroke-width="1.5" opacity=".7"><path d="M-10 209q37-10 75 0t75 0 75 0 75 0 75 0 75 0 75 0 75 0M-30 247q38-10 76 0t76 0 76 0 76 0 76 0 76 0 76 0 76 0M10 280q35-7 70 0t70 0 70 0 70 0 70 0 70 0 70 0"/></g><path d="m306 195 70 0m-56 12h45m-35 12h19" stroke="#eee5ab" stroke-width="3" opacity=".6"/></g>
 <path d="M24 328q118-80 235-31t278 14v51H24Z" fill="#e8d8ac"/><path d="M25 334q122-54 236-20t274 9" stroke="#fbf2d5" stroke-width="6"/>
 <!-- Sway is limited to the fronds; the trunk and content remain still. -->
 <path d="M112 320q35-105 15-205" stroke="#9b835a" stroke-width="12"/><path d="m119 274 15 3m-11-34 14 2m-12-31 12 1m-11-28 11 1m-11-28h10" stroke="#c7b283" stroke-width="3"/>
 <g class="atmos-motion summer-palm" style="transform-origin:127px 114px">
 <path d="M127 114C98 26 25 29 17 98c35-38 68-24 110 16Z" fill="#327969"/>
 <path d="M127 114C130 16 205 14 239 66c-59-17-73 11-112 48Z" fill="#377f69"/>
 <path d="M127 114C72 62 12 94 6 154c33-37 77-23 121-40Z" fill="#225f55"/>
 <path d="M127 114c68-57 130-14 139 46-55-45-89-25-139-46Z" fill="#427e63"/>
 <path d="M127 114c-7-70-48-92-71-96 23 30 17 68 71 96Z" fill="#51936f"/>
 <path d="M127 114c-26 2-52 46-42 90 24-30 32-53 42-90Z" fill="#40816c"/>
 <g stroke="#87ab7b" stroke-width="1.3"><path d="M127 114 45 64M127 114l82-70M127 114 30 128M127 114l104 17M127 114 74 46M127 114l-34 68"/></g></g>
 <path d="M404 309V191" stroke="#927650" stroke-width="3"/><path d="M325 207q79-112 158 0Z" fill="#f3e9c6" stroke="#c8ba88"/><path d="M355 207q49-105 98 0" fill="#68aaa1"/><path d="M382 207q22-105 44 0" fill="#f3e9c6"/>
 <path d="m326 311 18-43h68l-12 43m-69-10h72m-63-23h68" stroke="#71634d" stroke-width="3"/><path d="m344 268-5-19m61 62 9 12m-82-12-8 12" stroke="#71634d" stroke-width="3"/>
 <ellipse cx="263" cy="317" rx="31" ry="6" fill="#b29462"/><path d="M263 318v31m-16 0h32" stroke="#8e7553" stroke-width="3"/>
 <path d="m251 285 4 27h15l4-27Z" fill="#b9ddd1" stroke="#4e998e"/><path d="m265 294 7-21 10-2" stroke="#9b8b54" stroke-width="2"/><circle cx="273" cy="285" r="8" fill="#ead477" stroke="#b99e48"/>
 <path d="M84 368h380" stroke="#bba879"/><path d="m465 332 8-6 8 6-7 7Z" fill="#d5b686"/><path d="M453 343q11-5 22 0" stroke="#b49a6b"/>
 `,'نسیم دریا، نور آفتاب و طعمی از تعطیلات');
 const rose=(x,y,s)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0c-26-36-54 2-28 24-18 25 23 50 39 22 35 5 40-37 13-39C21-13 8-13 0 0Z" fill="#a25067"/><path d="M-10 6q-24 10-3 28 27 11 30-12Q10 0-10 6Z" fill="#c07f8b"/><path d="M-9 16q5-12 15-5 12 17-4 21-17-1-11-16Z" fill="#853c55"/><path d="m-8 16 12 6 1 11" stroke="#d7a3a6" stroke-width="1.2"/></g>`;
 const valentine=scene('valentine',`
 <defs><radialGradient id="rose-light"><stop stop-color="#e4b184" stop-opacity=".45"/><stop offset="1" stop-color="#e4b184" stop-opacity="0"/></radialGradient><linearGradient id="rose-arch" x1="280" y1="60" x2="280" y2="320" gradientUnits="userSpaceOnUse"><stop stop-color="#552835"/><stop offset="1" stop-color="#341d2a"/></linearGradient></defs>
 <path d="M79 322V222a201 201 0 0 1 402 0v100Z" fill="url(#rose-arch)"/><path d="M91 321V222a189 189 0 0 1 378 0v99" stroke="#bd9380" stroke-opacity=".5"/><path d="M102 320V222a178 178 0 0 1 356 0v98" stroke="#916c66" stroke-opacity=".5"/>
 <path d="M74 85q197 74 402-4" stroke="#b78c74" stroke-width="1.2"/>
 <g class="atmos-motion valentine-lights" fill="#e6c098">${[[110,98],[159,111],[210,122],[263,124],[316,121],[368,112],[418,97]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3"/><circle cx="${x}" cy="${y}" r="12" fill="url(#rose-light)"/>`).join('')}</g>
 <ellipse cx="280" cy="327" rx="185" ry="24" fill="#956779"/><path d="M105 327h350v32H105Z" fill="#6b4051"/><path d="M133 337q139 14 294 0" stroke="#b7868d"/>
 <path d="M277 316v-99m-5 39-37-38m42 50 35-42m-33 19 20-49" stroke="#708d78" stroke-width="3"/>
 <path d="M271 288q-35-2-38-25 26-1 38 25Zm10-13q30-5 36-29-31-1-36 29Z" fill="#5c7968"/>
 ${rose(225,196,.65)}${rose(281,185,.87)}${rose(320,215,.6)}
 <path d="M254 274h51l-7 50h-37Z" fill="#b48779" stroke="#d6afa0"/><ellipse cx="279" cy="274" rx="25" ry="4" fill="#d1ad98"/><path d="m268 285 3 28m10-30v30m11-29-3 29" stroke="#ddb9a4"/>
 <path d="M164 267h37l-4 25q-14 20-29 0Z" fill="#c7a9ad" fill-opacity=".18" stroke="#c59d9f"/><path d="M168 282h30q-2 21-15 21t-15-21Z" fill="#964358"/><path d="M183 303v25m-15 0h29" stroke="#d2b2ac" stroke-width="1.5"/>
 <path d="M346 257h37l-4 25q-14 20-29 0Z" fill="#c7a9ad" fill-opacity=".18" stroke="#c59d9f"/><path d="M350 272h30q-2 21-15 21t-15-21Z" fill="#a55264"/><path d="M365 293v35m-15 0h29" stroke="#d2b2ac" stroke-width="1.5"/>
 <ellipse class="atmos-motion valentine-lights" cx="414" cy="264" rx="46" ry="65" fill="url(#rose-light)"/><path d="M408 270h13v55h-13Z" fill="#dbc2aa"/><path class="atmos-motion atmos-flame" d="M414 248c-12 15-5 25 1 21 9-5 0-12-1-21Z" fill="#f3cea0"/>
 <path d="M115 292q-15-55 19-109m-12 36-14-14m10 32 22-13" stroke="#8f9b7b" stroke-width="1.5"/>
 <path d="M181 354q24-9 37 0m109-1q15 7 25-1" stroke="#bb8c8f"/><path d="M236 342q-12-17-19-7-6 15 19 7Z" fill="#d9a5ae"/>
 <path d="M130 373h300" stroke="#91655f"/>
 `,'نور گرم، عطر رز و یک میز برای لحظه‌های مشترک');
 const pumpkin=(x,y,s)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M0-35q-7-17 4-23" stroke="#8b9963" stroke-width="7" stroke-linecap="round"/><ellipse rx="45" ry="35" fill="#b97038"/><ellipse rx="31" ry="35" fill="#ca8544"/><ellipse rx="14" ry="35" fill="#dc9954"/><path d="m0-13 4 8 9 1-7 7 2 10-8-5-8 5 2-10-7-7 9-1Z" fill="#f4d58a"/></g>`;
 const halloween=scene('halloween',`
 <defs><radialGradient id="hallow-light"><stop stop-color="#e6b565" stop-opacity=".6"/><stop offset="1" stop-color="#e6b565" stop-opacity="0"/></radialGradient><radialGradient id="hallow-moon-glow"><stop stop-color="#e4d7b9" stop-opacity=".35"/><stop offset="1" stop-color="#e4d7b9" stop-opacity="0"/></radialGradient><linearGradient id="hallow-door"><stop stop-color="#432f51"/><stop offset="1" stop-color="#251d35"/></linearGradient></defs>
 <circle class="atmos-motion halloween-moon" cx="385" cy="97" r="63" fill="url(#hallow-moon-glow)"/><circle cx="385" cy="97" r="40" fill="#ddd0ac"/><circle cx="372" cy="82" r="7" fill="#c9b997" opacity=".6"/><circle cx="399" cy="111" r="10" fill="#c9b997" opacity=".5"/>
 <path d="M152 323V159a119 119 0 0 1 238 0v164Z" fill="url(#hallow-door)" stroke="#706072"/><path d="M167 321V160a104 104 0 0 1 208 0v161" stroke="#a18975"/>
 <path d="M188 320V166a83 83 0 0 1 166 0v154Z" fill="#191c2a" stroke="#716779"/>
 <path d="M255 317V208a40 40 0 0 1 80 0v109Z" fill="#bd8549"/><path d="M263 316V210a32 32 0 0 1 64 0v106Z" fill="#d7aa67"/><path d="M295 182v134m-29-92h58m-58 46h58" stroke="#514a42" stroke-width="4"/>
 <ellipse class="atmos-motion halloween-lantern" cx="295" cy="273" rx="85" ry="91" fill="url(#hallow-light)"/>
 <path d="M177 322h188l19 12H161Zm-16 15h223l19 12H143Zm-18 14h260l20 13H125Z" fill="#4a4257" stroke="#746578"/>
 <g class="atmos-motion halloween-branch" style="transform-origin:92px 326px"><path d="M92 326q29-103 4-224m11 63-40-52m40 76 44-51m-43 84-54-38m52 61 44-15M91 122l14-54" stroke="#807082" stroke-width="4" stroke-linecap="round"/><path d="m72 120-4-23m81 43 3-21m-16 35 18 2m-83 43-23-1" stroke="#807082" stroke-width="2"/></g>
 <path d="M60 112h28v39H60Z" fill="#936b40" stroke="#bd9b63"/><path d="m55 112 19-14 19 14Zm3 42h32" stroke="#ac9274"/><path d="M74 97V86m-7 46h15" stroke="#bc9a65"/><rect class="atmos-motion halloween-lantern" x="65" y="118" width="18" height="27" fill="#ebc77e"/>
 <g fill="#af926c" opacity=".8"><circle cx="129" cy="68" r="1.3"/><circle cx="454" cy="174" r="1"/><path d="m222 52 1 4 4 1-4 1-1 4-1-4-4-1 4-1Z"/></g>
 ${pumpkin(410,319,.86)}${pumpkin(141,325,.63)}
 <path d="M54 368q178-17 453 1" stroke="#8c7880"/>
 <path d="M436 231q-11 33 13 48m-12-20 21-8m-20 8-13-11" stroke="#9e8469" stroke-width="1.4"/>
 <g fill="#b48049"><path d="M437 255q-23-7-15-22 19 2 15 22ZM439 260q23-18 29-7-4 20-29 7Z"/></g>
 `,'ماه روشن، فانوس گرم و شبی کمی رازآلود');
 window.OccasionVisuals=Object.freeze({...window.OccasionVisuals,
  summer:Object.freeze({name:'تابستان',hint:'آفتاب و نسیم دریا',symbol:'☀',version:1,art:summer,kicker:'به وقت آفتاب و آرامش',title:'طعمِ یک تعطیلاتِ دل‌چسب',subtitle:'نسیم خنک، رنگ دریا و انتخاب‌هایی برای یک روز روشن.',signature:'کمی دریا، کمی آفتاب، کمی حالِ خوب',motion:true}),
  valentine:Object.freeze({name:'ولنتاین',hint:'رز و نور گرم',symbol:'♡',version:2,art:valentine,kicker:'برای لحظه‌های دونفره',title:'بعضی طعم‌ها، خاطره می‌شوند',subtitle:'یک مکث آرام کنار عزیزان، با عطر گل و گرمای باهم بودن.',signature:'به عشقِ لحظه‌های مشترک',motion:true}),
  halloween:Object.freeze({name:'هالووین',hint:'ماه، مه و فانوس',symbol:'☾',version:1,art:halloween,kicker:'یک شب متفاوت، یک انتخاب خوش‌طعم',title:'به ضیافتِ شب خوش آمدید',subtitle:'زیر نور ماه و فانوس‌ها؛ شبی دل‌نشین با چاشنی خیال.',signature:'شبِ فانوس‌های روشن',motion:true})
 });
})();
