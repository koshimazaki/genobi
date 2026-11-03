import fresnel from "./vendor/fresnel.js";
export const quadVertex = /* glsl */ `
varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}
`;
export const screenFragment = /* glsl */ `
uniform sampler2D source;
uniform float time, amount, effect;
varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 reflected(vec2 uv){return abs(fract(uv*.5)*2.-1.);}
vec3 sampleSource(vec2 uv){return texture2D(source,clamp(uv,.001,.999)).rgb;}
void main(){
 vec2 uv=vUv; vec3 color;
 if(effect<.5){
  vec2 q=uv-.5;uv=.5+q*(1.+dot(q,q)*.24*amount);
  float row=floor(uv.y*160.);float tear=step(.97,sin(floor(time*5.)*2.13));
  uv.x+=sin(row*9.1+time*15.)*.006*amount*tear;
  float spread=(.0015+.0035*pow(abs(uv.x-.5)*2.,2.))*amount;
  color=vec3(sampleSource(uv+vec2(spread,0.)).r,sampleSource(uv).g,sampleSource(uv-vec2(spread,0.)).b);
  color=mix(color,vec3(dot(color,vec3(.22,.71,.07)))*vec3(.60,1.,.84),.38*amount);
  float sweep=1.-abs(uv.y-fract(time*.19));
  color+=pow(sweep,100.)*vec3(.13,.55,.36)*amount;
  color*=.93+.07*sin(uv.y*540.*3.14159);
  color+=(hash(floor(uv*vec2(960.,540.))+floor(time*24.))-.5)*.038*amount;
  color*=1.-smoothstep(.25,.74,length((vUv-.5)*vec2(1.,1.25)))*.75;
 }else{
  vec2 p=(uv-.5)*vec2(1.77778,1.);float r=length(p);float a=atan(p.y,p.x);
  a+=.13*sin(r*8.-time*.6)*amount+time*.055;
  float sector=3.14159265/3.; a=abs(mod(a+sector*.5,sector)-sector*.5);
  vec2 fold=vec2(cos(a),sin(a))*r;
  vec2 wave=vec2(sin(fold.y*11.+time*.7)+sin(fold.x*6.-time*.4),cos(fold.x*9.-time*.6)+cos(fold.y*7.+time*.5));
  vec2 flow=fold+wave*(.025+.055*amount);
  vec2 tex=reflected(flow*1.7+vec2(.32+time*.022,.2));
  vec3 c=sampleSource(tex);vec3 c2=sampleSource(reflected(tex+wave*.035));
  float glass=.5+.5*sin(r*29.-a*10.+wave.x*2.+time*.7);
  vec3 cold=vec3(.12,.63,.73),warm=vec3(.94,.46,.21);
  color=mix(c,c2,.5)*1.15;
  color=mix(color,mix(cold,warm,glass)*(.28+dot(c,vec3(.3,.5,.2))*1.4),.5);
  color+=pow(glass,16.)*vec3(.58,.82,.82)*(.25+.35*amount);
  color*=.7+.3*(1.-smoothstep(.3,1.05,r));
 }
 gl_FragColor=vec4(pow(max(color,0.),vec3(.92)),1.);
}
`;
export const terrainVertex = /* glsl */ `
uniform sampler2D source;
uniform float time,amount;
varying vec2 vUv;
varying vec3 vNormal,vView;
varying float vHeight;
float luma(vec2 p){return dot(texture2D(source,clamp(p,0.,1.)).rgb,vec3(.2126,.7152,.0722));}
void main(){
 vUv=uv;float h=luma(uv);vec3 p=position;
 p.z+=(h-.38)*(1.05*amount+.12);
 float dx=luma(uv+vec2(.008,0.))-luma(uv-vec2(.008,0.));
 float dy=luma(uv+vec2(0.,.008))-luma(uv-vec2(0.,.008));
 vNormal=normalize(normalMatrix*vec3(-dx*amount*9.,-dy*amount*9.,1.));
 vec4 view=modelViewMatrix*vec4(p,1.);vView=normalize(-view.xyz);vHeight=h;
 gl_Position=projectionMatrix*view;
}
`;
export const terrainFragment = /* glsl */ `
uniform sampler2D source;
uniform float wire;
varying vec2 vUv;
varying vec3 vNormal,vView;
varying float vHeight;
${fresnel}
void main(){
 vec3 src=texture2D(source,vUv).rgb;
 float edge=getFresnel(normalize(vView),normalize(vNormal),2.4);
 vec3 color=mix(src*.32,vec3(.09,.34,.42),.3)+edge*vec3(.23,.40,.84);
 if(wire>.5)color=mix(vec3(.22,.52,.63),vec3(.94,.78,.43),vHeight)+edge*vec3(.2,.38,.7);
 gl_FragColor=vec4(color,1.);
}
`;
