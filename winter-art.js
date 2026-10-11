/* Local vector scenery: transparent sky lets the real snow layer remain visible. */
(() => {
  const fir = (x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 35 59H23l24 40H31l24 40H8v22H-8v-22h-47l24-40h-16l24-40h-12Z" fill="#31525d"/><path d="M0 0 30 51 0 39-30 51Zm0 51 37 43-37-12-37 12Zm0 44 47 39-47-10-47 10Z" fill="#c6dfdf"/><path d="M0 9v145" stroke="#779ba0" opacity=".35"/></g>`;
  const branch=`<g fill="none" stroke-linecap="round"><path d="M25 46q55 29 143 6M75 63 48 27m50 37-5-38m24 35 27-33M68 63 42 83m68-20 8 24m21-30 24 17" stroke="#608894" stroke-width="3"/><path d="M26 39q53 31 140 5M75 56 52 27m47 30-5-31m26 28 23-27" stroke="#d5e8e7" stroke-width="5"/><path d="m54 34-10 2m21 13-12 1m42-15-10 3m10 9-9 3m46-14 10 4m-18 8 10 3" stroke="#cce0e3" stroke-width="2"/></g>`;
  const art=`<figure class="hero-art occasion-scene scene-winter"><svg viewBox="0 0 560 390" fill="none" aria-hidden="true" focusable="false">
  <defs><linearGradient id="winter-mountain" x1="280" y1="120" x2="280" y2="330" gradientUnits="userSpaceOnUse"><stop stop-color="#9dc7d8" stop-opacity=".45"/><stop offset="1" stop-color="#274659" stop-opacity=".1"/></linearGradient><radialGradient id="winter-window"><stop stop-color="#ffdb9b"/><stop offset="1" stop-color="#b97742"/></radialGradient><radialGradient id="winter-light"><stop stop-color="#f5cb84" stop-opacity=".55"/><stop offset="1" stop-color="#e1ae6a" stop-opacity="0"/></radialGradient></defs>
  <circle cx="353" cy="66" r="30" fill="#c6e3ed" opacity=".9"/><circle cx="363" cy="56" r="28" fill="#132b42"/>
  <path d="m16 275 107-145 58 66 58-95 96 119 42-57 155 125v60H16Z" fill="url(#winter-mountain)"/>
  <path d="m91 174 32-44 35 40-21-7-13 8-10-14Zm122-33 26-40 37 46-23-10-14 7-13-13Zm146 47 18-25 24 22-13-5-11 8-8-11Z" fill="#cee4ec" opacity=".6"/>
  <g fill="#b5d5e4" opacity=".6"><circle cx="220" cy="59" r="1.2"/><circle cx="459" cy="92" r="1.4"/><circle cx="408" cy="51" r="1"/><circle cx="169" cy="89" r="1"/></g>
  ${branch}
  ${fir(448,135,.86)}${fir(491,192,.57)}${fir(103,188,.61)}
  <path d="M20 337q120-49 258-13t266-12v46H20Z" fill="#90b3c3"/><path d="M8 355q150-28 286-14t258-11v41H8Z" fill="#d0e3e7"/>
  <!-- Snow-capped mountain restaurant with a softly glowing window. -->
  <path d="M162 233h214v104H162Z" fill="#294151" stroke="#527181"/><path d="m143 239 126-96 126 96Z" fill="#172e3e" stroke="#7194a7"/>
  <path d="m140 237 129-100 129 100-21 5-108-83-108 83Z" fill="#d7e9e9"/>
  <path d="M169 246h199m-199 18h199m-199 18h199m-199 18h199m-199 18h199" stroke="#3c5867"/>
  <path d="M324 151v-32h23v47" fill="#375566"/><path d="M319 118h33v9h-33Z" fill="#cde1e7"/>
  <g class="winter-glow"><ellipse cx="270" cy="280" rx="84" ry="73" fill="url(#winter-light)"/><path d="M226 329v-75a42 42 0 0 1 84 0v75Z" fill="url(#winter-window)" stroke="#7c644e" stroke-width="4"/><path d="M269 216v110m-39-55h77m-77 29h77" stroke="#3e413c" stroke-width="4"/><path d="m237 322 14-30 12 9 13-35 16 57" fill="#594d39" opacity=".38"/></g>
  <path d="M228 335h81l18 9H212Z" fill="#b7d0d9"/>
  <path d="M183 255h23v31h-23Z" fill="#d5aa72"/><path d="m195 254 0 33m-12-16h23" stroke="#36515f" stroke-width="2"/>
  <path d="M331 255h23v31h-23Z" fill="#d5aa72"/><path d="m342 254 0 33m-12-16h23" stroke="#36515f" stroke-width="2"/>
  <!-- Festoon bulbs have a gentle luminance pulse, no flashing. -->
  <path d="M175 233q95 31 191 0" stroke="#8a9e9f"/>
  <g class="winter-glow" fill="#f5d095">${[187,211,239,268,297,325,352].map((x,i)=>`<circle cx="${x}" cy="${241+Math.sin(i/6*Math.PI)*11}" r="3"/>`).join('')}</g>
  ${fir(70,235,.63)}${fir(422,248,.51)}
  <path d="M268 345q-27 11-14 24" stroke="#e8f0ec" stroke-width="13"/>
  <g transform="translate(0 25)"><path d="M473 308v-83m-1 0h-15" stroke="#496576" stroke-width="3"/><path d="m447 228 20 0-2 24h-16Z" fill="#c19b66" stroke="#8cafb9"/><ellipse class="winter-glow" cx="457" cy="240" rx="23" ry="31" fill="url(#winter-light)"/><path d="M445 226h24l-12-8Z" fill="#b4d2df"/></g>
  <path d="M77 382h407" stroke="#436479"/>
  </svg><figcaption>بیرون، برف آرام می‌بارد؛ اینجا، عطر یک غذای گرم.</figcaption></figure>`;
  window.OccasionVisuals = Object.freeze({...window.OccasionVisuals, winter:Object.freeze({
    name:'زمستان', hint:'برف، نور و آرامش', symbol:'❄', version:1,
    art, kicker:'یک شب برفی، یک میز گرم', title:'گرمای یک لقمه، در دل زمستان',
    subtitle:'کمی از سرمای روز فاصله بگیرید؛ به سفره‌ای گرم و صمیمی خوش آمدید.',
    signature:'طعمِ گرمِ شب‌های سرد', motion:true
  })});
})();
