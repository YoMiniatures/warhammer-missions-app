import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==========================================
//  SUN EFFECT SHADERS (adapted from fwdapps.net reference)
// ==========================================

const NOISE_4D = `
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
float mod289(float x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
float permute(float x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float taylorInvSqrt(float r){return 1.79284291400159-.85373472095314*r;}
vec4 grad4(float j,vec4 ip){
 const vec4 ones=vec4(1,1,1,-1);vec4 p,s;
 p.xyz=floor(fract(vec3(j)*ip.xyz)*7.)*ip.z-1.;
 p.w=1.5-dot(abs(p.xyz),ones.xyz);
 s=vec4(lessThan(p,vec4(0)));
 p.xyz=p.xyz+(s.xyz*2.-1.)*s.www;return p;}
#define F4 .309016994374947451
float snoise(vec4 v){
 const vec4 C=vec4(.138196601125011,.276393202250021,.414589803375032,-.447213595499958);
 vec4 i=floor(v+dot(v,vec4(F4)));vec4 x0=v-i+dot(i,C.xxxx);
 vec4 i0;vec3 isX=step(x0.yzw,x0.xxx);vec3 isYZ=step(x0.zww,x0.yyz);
 i0.x=isX.x+isX.y+isX.z;i0.yzw=1.-isX;
 i0.y+=isYZ.x+isYZ.y;i0.zw+=1.-isYZ.xy;i0.z+=isYZ.z;i0.w+=1.-isYZ.z;
 vec4 i3=clamp(i0,0.,1.);vec4 i2=clamp(i0-1.,0.,1.);vec4 i1=clamp(i0-2.,0.,1.);
 vec4 x1=x0-i1+C.xxxx;vec4 x2=x0-i2+C.yyyy;vec4 x3=x0-i3+C.zzzz;vec4 x4=x0+C.wwww;
 i=mod289(i);
 float j0=permute(permute(permute(permute(i.w)+i.z)+i.y)+i.x);
 vec4 j1=permute(permute(permute(permute(
  i.w+vec4(i1.w,i2.w,i3.w,1))+i.z+vec4(i1.z,i2.z,i3.z,1))
  +i.y+vec4(i1.y,i2.y,i3.y,1))+i.x+vec4(i1.x,i2.x,i3.x,1));
 vec4 ip2=vec4(1./294.,1./49.,1./7.,0.);
 vec4 p0=grad4(j0,ip2);vec4 p1=grad4(j1.x,ip2);
 vec4 p2=grad4(j1.y,ip2);vec4 p3=grad4(j1.z,ip2);vec4 p4=grad4(j1.w,ip2);
 vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
 p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;p4*=taylorInvSqrt(dot(p4,p4));
 vec3 m0=max(.6-vec3(dot(x0,x0),dot(x1,x1),dot(x2,x2)),0.);
 vec2 m1=max(.6-vec2(dot(x3,x3),dot(x4,x4)),0.);m0=m0*m0;m1=m1*m1;
 return 49.*(dot(m0*m0,vec3(dot(p0,x0),dot(p1,x1),dot(p2,x2)))+dot(m1*m1,vec2(dot(p3,x3),dot(p4,x4))));
}`;

const VISIBILITY = `
uniform float uVisibility;uniform float uDirection;uniform vec3 uLightView;
float getAlpha(vec3 n){
 float d=dot(n,uLightView)*uDirection;
 return smoothstep(1.,1.5,d+uVisibility*2.5);}`;

const PERLIN_VS = `varying vec3 vWorld;
void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;

const PERLIN_FS = `precision highp float;
varying vec3 vWorld;
uniform float uTime,uSpatialFrequency,uTemporalFrequency,uH,uContrast,uFlatten;
#define OCTAVES 5
${NOISE_4D}
vec2 fbm(vec4 p){float a=1.,f=1.;vec2 s=vec2(0);
 for(int i=0;i<OCTAVES;i++){s.x+=snoise(p*f)*a;p.w+=100.;s.y+=snoise(p*f)*a;a*=uH;f*=2.;}return s;}
void main(){
 vec3 w=normalize(vWorld)+12.45;
 vec4 p=vec4(w*uSpatialFrequency,uTime*uTemporalFrequency);
 vec2 f=fbm(p)*uContrast+.5;
 float m=max(snoise(vec4(w*2.,uTime*uTemporalFrequency)),0.);
 gl_FragColor=vec4(mix(f.x,f.x*m,uFlatten),f.y,f.y,mix(f.x,f.x*m,uFlatten));}`;

const SUN_VS = `varying vec3 vWorld,vNormalView,vNormalWorld,vLayer0,vLayer1,vLayer2;
uniform float uTime;
mat2 rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
void main(){
 vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;
 vNormalView=normalize(normalMatrix*normal);
 vNormalWorld=normalize((modelMatrix*vec4(normal,0.)).xyz);
 vec3 n=normalize(normal);float t=uTime;
 vec3 p1=n;p1.yz=rot(t)*p1.yz;vLayer0=p1;
 p1=n;p1.zx=rot(t+2.094)*p1.zx;vLayer1=p1;
 p1=n;p1.xy=rot(t-4.188)*p1.xy;vLayer2=p1;
 gl_Position=projectionMatrix*viewMatrix*world;}`;

const SUN_FS = `precision highp float;
${VISIBILITY}
varying vec3 vWorld,vNormalView,vNormalWorld,vLayer0,vLayer1,vLayer2;
uniform samplerCube uPerlinCube;
uniform float uFresnelPower,uFresnelInfluence,uTint,uBase,uBrightnessOffset,uBrightness;
vec3 brightnessToColor(float b){b*=uTint;return(vec3(b,b*b*b,b*b*b*b)/uTint)*uBrightness;}
float ocean(){return(textureCube(uPerlinCube,vLayer0).r+textureCube(uPerlinCube,vLayer1).r+textureCube(uPerlinCube,vLayer2).r)*.333;}
void main(){
 vec3 V=normalize((viewMatrix*vec4(vWorld-cameraPosition,0.)).xyz);
 float f=pow(1.-dot(vNormalView,-V),uFresnelPower)*uFresnelInfluence;
 float b=ocean()*uBase+uBrightnessOffset+f;
 gl_FragColor=vec4(clamp(brightnessToColor(b),0.,1.),getAlpha(normalize(vNormalWorld)));}`;

const GLOW_VS = `attribute vec3 aPos;varying float vRadial;varying vec3 vWorld;
uniform mat4 uViewProjection;uniform float uRadius;uniform vec3 uCamUp,uCamPos;
void main(){vRadial=aPos.z;
 vec3 side=normalize(cross(normalize(-uCamPos),uCamUp));
 vec3 p=aPos.x*side+aPos.y*uCamUp;p*=1.+aPos.z*uRadius;
 vWorld=p;gl_Position=uViewProjection*vec4(p,1.);}`;

const GLOW_FS = `precision highp float;
${VISIBILITY}
varying float vRadial;varying vec3 vWorld;
uniform float uTint,uBrightness,uFalloffColor;
vec3 brightnessToColor(float b){b*=uTint;return(vec3(b,b*b*b,b*b*b*b)/uTint)*uBrightness;}
void main(){
 float a=(1.-vRadial);a*=a;
 float b=1.+a*uFalloffColor;a*=getAlpha(normalize(vWorld));
 gl_FragColor=vec4(brightnessToColor(b)*a,a);}`;

const RAYS_VS = `attribute vec3 aPos,aPos0;attribute vec4 aWireRandom;
varying float vUVY,vOpacity;varying vec3 vColor,vNormal;
uniform float uLength,uWidth,uTime,uNoiseFrequency,uNoiseAmplitude,uOpacity;
uniform vec3 uCamPos;uniform mat4 uViewProjection;
#define m4 mat4(0.,.8,.6,-.4,-.8,.36,-.48,-.5,-.6,-.48,.64,.2,.4,.3,.2,.4)
vec4 tsn(vec4 q,float fo){float a=1.,f=1.;vec4 s2=vec4(0);
 for(int i=0;i<4;i++){q=m4*q;vec4 s=sin(q.ywxz*f)*a;q+=s;s2+=s;a*=fo;f/=fo;}return s2;}
vec3 getP(float ph){float sz=aWireRandom.z+.2;float d=ph*uLength*sz;
 vec3 p=aPos0+aPos0*d;p+=tsn(vec4(p*uNoiseFrequency,uTime),.707).xyz*(d*uNoiseAmplitude);return p;}
void main(){vUVY=aPos.z;
 float ap=fract(uTime*.3*(aWireRandom.y*.5)+aWireRandom.x);
 vec3 p=getP(aPos.x),p1=getP(aPos.x+.01);
 vec3 pw=(modelMatrix*vec4(p,1.)).xyz,p1w=(modelMatrix*vec4(p1,1.)).xyz;
 vec3 dir=normalize(p1w-pw),vw=normalize(pw-uCamPos),sd=normalize(cross(vw,dir));
 if(length(sd)<1e-6){vec3 up=abs(dir.y)<.99?vec3(0,1,0):vec3(1,0,0);sd=normalize(cross(up,dir));}
 vec3 pW=pw+sd*(uWidth*aPos.z*(1.-aPos.x));
 vNormal=normalize(pW);vOpacity=uOpacity*(.5+aWireRandom.w);
 vColor=vec3(1.,.15+aWireRandom.w*.3,.05);
 gl_Position=uViewProjection*vec4(pW,1.);}`;

const RAYS_FS = `precision highp float;
${VISIBILITY}
varying float vUVY,vOpacity;varying vec3 vColor,vNormal;
void main(){
 float a=1.-smoothstep(0.,1.,abs(vUVY));a*=a;a*=vOpacity;a*=getAlpha(vNormal);
 gl_FragColor=vec4(vColor*a,a);}`;

// ==========================================
//  VOIDMAP - THREE.JS STAR SYSTEM
// ==========================================

const API_URL = '/api';

// State
let planetas = [];
let selectedYear = new Date().getFullYear();
let currentView = '3d'; // '3d' | 'linear'
let zoomState = 'zoomed'; // 'zoomed' (planet closeup) | 'overview' (system view)
let isAnimatingCamera = false;
let firstLoad = true;

// Three.js objects
let scene, camera, renderer, controls;
let planetMeshes = [];
let raycaster, mouse;
let animationId;
let centralStar;
let imperialShip;
let sunEffect = null;

// Camera positions
const OVERVIEW_POS = { x: 0, y: 8, z: 12 };
const OVERVIEW_TARGET = { x: 0, y: 0, z: 0 };

// System name mapping
const SYSTEM_NAMES = {
    2025: 'SISTEMA AQUILA',
    2026: 'SISTEMA HIPPARION'
};

// Estado colors
const ESTADO_COLORS = {
    'conquistado': 0x10b981,
    'en-conquista': 0xf59e0b,
    'bloqueado': 0xd41132,
    'pendiente': 0x555566
};

// ==========================================
//  UTILITY FUNCTIONS (same pattern as other pages)
// ==========================================

function getFechaImperial() {
    const now = new Date();
    const dias = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const diaSemana = dias[now.getDay()];
    const dia = String(now.getDate()).padStart(2, '0');
    const mes = meses[now.getMonth()];
    return `+++ ${diaSemana} ${dia} ${mes} +++`;
}

function setLoading(loading) {
    const loadingEl = document.getElementById('loading-state');
    const errorEl = document.getElementById('error-state');
    const view3d = document.getElementById('view-3d');
    const viewLinear = document.getElementById('view-linear');
    const controlsBar = document.querySelector('[data-controls]') || document.getElementById('year-switcher')?.parentElement;

    if (loading) {
        loadingEl.classList.remove('hidden');
        errorEl.classList.add('hidden');
        view3d.classList.add('hidden');
        viewLinear.classList.add('hidden');
    } else {
        loadingEl.classList.add('hidden');
        if (currentView === '3d') {
            view3d.classList.remove('hidden');
            viewLinear.classList.add('hidden');
        } else {
            view3d.classList.add('hidden');
            viewLinear.classList.remove('hidden');
        }
    }
}

function showError() {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
    document.getElementById('error-state').classList.add('flex');
    document.getElementById('view-3d').classList.add('hidden');
    document.getElementById('view-linear').classList.add('hidden');
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.background = type === 'error' ? '#d41132' : '#16a34a';
    toast.innerHTML = `<span class="material-symbols-outlined text-sm mr-1">${type === 'error' ? 'error' : 'check_circle'}</span>${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==========================================
//  THREE.JS SCENE
// ==========================================

function initThreeScene() {
    const container = document.getElementById('three-container');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0b); // fallback while skybox loads

    // Camera
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // OrbitControls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI * 0.75;
    controls.minPolarAngle = Math.PI * 0.15;
    controls.minDistance = 1.5;
    controls.maxDistance = 20;
    controls.enablePan = false;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.3;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x555566, 0.8);
    scene.add(ambientLight);

    const centralLight = new THREE.PointLight(0xd41132, 2, 8);
    centralLight.position.set(0, 0, 0);
    scene.add(centralLight);

    // Directional light for ship and planet visibility
    const dirLight = new THREE.DirectionalLight(0xccccdd, 1.2);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // Subtle fill light from opposite side
    const fillLight = new THREE.DirectionalLight(0x556677, 0.4);
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);

    // Shader-based sun effect (central star)
    setupSunEffect();

    // Orbit ring
    const orbitGeometry = new THREE.RingGeometry(4.9, 5.1, 64);
    const orbitMaterial = new THREE.MeshBasicMaterial({ color: 0x332224, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
    const orbitRing = new THREE.Mesh(orbitGeometry, orbitMaterial);
    orbitRing.rotation.x = -Math.PI / 2;
    scene.add(orbitRing);

    // Skybox sphere (space nebula background)
    createSkybox();

    // Raycaster for click detection
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Events
    renderer.domElement.addEventListener('pointerup', onPlanetClick);
    window.addEventListener('resize', onResize);
}

function createSkybox() {
    const skyGeo = new THREE.SphereGeometry(60, 32, 32);
    const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyMesh);

    textureLoader.load('/assets/skybox.jpg', (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        skyMat.map = texture;
        skyMat.needsUpdate = true;
        scene.background = null; // remove solid color fallback, let skybox show
    });
}

// ==========================================
//  SUN EFFECT SETUP
// ==========================================

function setupSunEffect() {
    const SUN_R = 0.6;

    // Perlin cubemap (animated noise for sun surface)
    const perlinScene = new THREE.Scene();
    const cubeRT = new THREE.WebGLCubeRenderTarget(128, {
        format: THREE.RGBAFormat, type: THREE.UnsignedByteType, generateMipmaps: false
    });
    const cubeCam = new THREE.CubeCamera(0.1, 100, cubeRT);
    const perlinMat = new THREE.ShaderMaterial({
        vertexShader: PERLIN_VS, fragmentShader: PERLIN_FS,
        depthWrite: false, side: THREE.BackSide,
        uniforms: {
            uTime: { value: 0 }, uSpatialFrequency: { value: 6 },
            uTemporalFrequency: { value: .1 }, uH: { value: 1 },
            uContrast: { value: .25 }, uFlatten: { value: .72 }
        }
    });
    perlinScene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), perlinMat));

    // Sun sphere
    const lightDir = new THREE.Vector3(1, 1, 1).normalize();
    const sunMat = new THREE.ShaderMaterial({
        vertexShader: SUN_VS, fragmentShader: SUN_FS,
        transparent: true, premultipliedAlpha: true, depthWrite: true,
        uniforms: {
            uTime: { value: 0 }, uPerlinCube: { value: cubeRT.texture },
            uFresnelPower: { value: 1 }, uFresnelInfluence: { value: .8 },
            uTint: { value: .2 }, uBase: { value: 4 },
            uBrightnessOffset: { value: 1 }, uBrightness: { value: .6 },
            uVisibility: { value: 1 }, uDirection: { value: 1 },
            uLightView: { value: lightDir.clone() }
        }
    });
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 32, 32), sunMat);
    scene.add(sunMesh);
    centralStar = sunMesh;

    // Glow billboard ring
    const seg = 64, rS = SUN_R - 0.01;
    const gPos = new Float32Array(6 * seg);
    let ri = 0;
    for (let a = 0; a < seg; a++) {
        const s = (a / seg) * Math.PI * 2, sx = Math.sin(s) * rS, sy = Math.cos(s) * rS;
        gPos[ri++] = sx; gPos[ri++] = sy; gPos[ri++] = 0;
        gPos[ri++] = sx; gPos[ri++] = sy; gPos[ri++] = 1;
    }
    const gIdx = new Uint16Array(seg * 6);
    let oi = 0;
    for (let a = 0; a < seg; a++) {
        const i0 = 2 * a, i1 = i0 + 1, i2 = 2 * ((a + 1) % seg), i3 = i2 + 1;
        gIdx[oi++] = i0; gIdx[oi++] = i1; gIdx[oi++] = i2;
        gIdx[oi++] = i2; gIdx[oi++] = i1; gIdx[oi++] = i3;
    }
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('aPos', new THREE.Float32BufferAttribute(gPos, 3));
    glowGeo.setIndex(new THREE.BufferAttribute(gIdx, 1));
    const glowMat = new THREE.ShaderMaterial({
        vertexShader: GLOW_VS, fragmentShader: GLOW_FS,
        transparent: true, premultipliedAlpha: true,
        depthWrite: false, depthTest: false, side: THREE.DoubleSide,
        uniforms: {
            uViewProjection: { value: new THREE.Matrix4() }, uRadius: { value: .35 },
            uTint: { value: .4 }, uBrightness: { value: 1.06 }, uFalloffColor: { value: .5 },
            uCamUp: { value: new THREE.Vector3(0, 1, 0) }, uCamPos: { value: new THREE.Vector3() },
            uVisibility: { value: 1 }, uDirection: { value: 1 }, uLightView: { value: lightDir.clone() }
        }
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.frustumCulled = false;
    glowMesh.renderOrder = 2;
    scene.add(glowMesh);

    // Sun rays (reduced count for mobile performance)
    const LC = 512, LL = 4;
    const rPos = new Float32Array(LC * LL * 6);
    const rPos0 = new Float32Array(LC * LL * 6);
    const rRand = new Float32Array(LC * LL * 8);
    const rIdx = new Uint16Array(LC * (LL - 1) * 6);
    let ip = 0, i0 = 0, ir = 0, ii = 0;
    const base = new THREE.Vector3(), jitter = new THREE.Vector3(), held = new THREE.Vector3();
    const randomUnit = v => {
        const z = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r2 = Math.sqrt(1 - z * z);
        v.set(r2 * Math.cos(t), r2 * Math.sin(t), z); return v;
    };
    let d2 = Math.random(), p2 = Math.random();
    for (let v = 0; v < LC; v++) {
        if (Math.random() < .1 || v === 0) { randomUnit(held); d2 = Math.random(); p2 = Math.random(); }
        base.copy(held); randomUnit(jitter).multiplyScalar(.025); base.add(jitter).normalize();
        const rands = [d2, p2, Math.random(), Math.random()];
        for (let m = 0; m < LL; m++) {
            for (let y = 0; y <= 1; y++) {
                rPos[ip++] = (m + .5) / LL; rPos[ip++] = (v + .5) / LC; rPos[ip++] = 2 * y - 1;
                for (let t = 0; t < 4; t++) rRand[ir++] = rands[t];
                rPos0[i0++] = base.x * SUN_R; rPos0[i0++] = base.y * SUN_R; rPos0[i0++] = base.z * SUN_R;
            }
            if (m < LL - 1) {
                const b2 = 2 * (v * LL + m);
                rIdx[ii++] = b2; rIdx[ii++] = b2 + 1; rIdx[ii++] = b2 + 2;
                rIdx[ii++] = b2 + 2; rIdx[ii++] = b2 + 1; rIdx[ii++] = b2 + 3;
            }
        }
    }
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute('aPos', new THREE.BufferAttribute(rPos, 3));
    rayGeo.setAttribute('aPos0', new THREE.BufferAttribute(rPos0, 3));
    rayGeo.setAttribute('aWireRandom', new THREE.BufferAttribute(rRand, 4));
    rayGeo.setIndex(new THREE.BufferAttribute(rIdx, 1));
    const rayMat = new THREE.ShaderMaterial({
        vertexShader: RAYS_VS, fragmentShader: RAYS_FS,
        transparent: true, premultipliedAlpha: true,
        depthWrite: false, depthTest: true,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: {
            uViewProjection: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
            uTime: { value: 0 }, uVisibility: { value: 1 }, uDirection: { value: 1 },
            uLightView: { value: lightDir.clone() },
            uWidth: { value: .02 }, uLength: { value: .45 }, uOpacity: { value: .03 },
            uNoiseFrequency: { value: 8 }, uNoiseAmplitude: { value: .4 }
        }
    });
    const rayMesh = new THREE.Mesh(rayGeo, rayMat);
    rayMesh.frustumCulled = false;
    rayMesh.renderOrder = 3;
    scene.add(rayMesh);

    // Cache scratch objects to avoid GC pressure
    sunEffect = {
        perlinScene, cubeCam, perlinMat, sunMat, glowMat, rayMat, lightDir, time: 0,
        _view: new THREE.Matrix4(), _vp: new THREE.Matrix4(),
        _camUp: new THREE.Vector3(), _camPos: new THREE.Vector3()
    };
}

function updateSunEffect() {
    if (!sunEffect) return;
    sunEffect.time += 0.016;

    // Bake perlin cubemap
    sunEffect.perlinMat.uniforms.uTime.value = sunEffect.time * 0.1;
    sunEffect.cubeCam.update(renderer, sunEffect.perlinScene);

    // Sun sphere
    sunEffect.sunMat.uniforms.uTime.value = sunEffect.time * 0.04;

    // Camera matrices (shared by glow + rays)
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    sunEffect._view.copy(camera.matrixWorld).invert();
    sunEffect._vp.multiplyMatrices(camera.projectionMatrix, sunEffect._view);
    sunEffect._camUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    camera.getWorldPosition(sunEffect._camPos);

    // Glow
    sunEffect.glowMat.uniforms.uViewProjection.value.copy(sunEffect._vp);
    sunEffect.glowMat.uniforms.uCamUp.value.copy(sunEffect._camUp);
    sunEffect.glowMat.uniforms.uCamPos.value.copy(sunEffect._camPos);

    // Rays
    sunEffect.rayMat.uniforms.uViewProjection.value.copy(sunEffect._vp);
    sunEffect.rayMat.uniforms.uCamPos.value.copy(sunEffect._camPos);
    sunEffect.rayMat.uniforms.uTime.value = sunEffect.time;
}

// ==========================================
//  PLANET TEXTURES
// ==========================================

const textureLoader = new THREE.TextureLoader();
const textureCache = {};

function createPlanets(planetasData) {
    // Clear existing planets
    planetMeshes.forEach(m => {
        scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
    });
    planetMeshes = [];

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const maxMissions = Math.max(...planetasData.map(p => p.totalMisiones || 1), 1);

    planetasData.forEach((planeta, index) => {
        const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
        const radius = 5;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        // Size based on total missions
        const size = 0.2 + (planeta.totalMisiones / maxMissions) * 0.4;

        // Color based on estado
        const color = ESTADO_COLORS[planeta.estado] || ESTADO_COLORS.pendiente;

        // Higher poly for textured spheres
        const geometry = new THREE.SphereGeometry(size, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: new THREE.Color(color),
            emissiveIntensity: 0.15,
            roughness: 0.8,
            metalness: 0.1
        });

        // Load planet texture if image exists
        if (planeta.image) {
            const imgUrl = `/api/planetas/imagen/${encodeURIComponent(planeta.image)}`;
            if (textureCache[imgUrl]) {
                material.map = textureCache[imgUrl];
                material.emissive.set(0x000000);
                material.emissiveIntensity = 0;
                material.needsUpdate = true;
            } else {
                textureLoader.load(imgUrl, (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    textureCache[imgUrl] = texture;
                    material.map = texture;
                    // Remove emissive tint so texture shows true colors
                    material.emissive.set(0x000000);
                    material.emissiveIntensity = 0;
                    material.needsUpdate = true;
                }, undefined, () => {
                    // Texture failed - fall back to estado color
                    material.color = new THREE.Color(color);
                    material.emissiveIntensity = 0.3;
                });
            }
        } else {
            // No image - use estado color
            material.color = new THREE.Color(color);
            material.emissiveIntensity = 0.3;
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, 0, z);
        mesh.userData = { planeta, index };

        // Golden ring for current month
        if (planeta.numeroMes === currentMonth && selectedYear === currentYear) {
            const ringGeometry = new THREE.TorusGeometry(size + 0.12, 0.025, 8, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xc5a065 });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.rotation.x = Math.PI / 2;
            mesh.add(ring);

            // Imperial Ship near current planet (loaded from GLB)
            loadImperialShip(x, z, size);
        }

        scene.add(mesh);
        planetMeshes.push(mesh);
    });
}

// ==========================================
//  IMPERIAL SHIP MODEL (GLB)
// ==========================================

let shipModelCache = null; // Cache loaded GLB to avoid re-fetching

function loadImperialShip(x, z, size) {
    if (shipModelCache) {
        // Clone cached model
        const ship = shipModelCache.clone();
        positionShip(ship, x, z, size);
        return;
    }

    const loader = new GLTFLoader();
    loader.load('/assets/ship.glb', (gltf) => {
        // Ensure materials are visible (replace dark/unlit materials)
        gltf.scene.traverse((child) => {
            if (child.isMesh) {
                const oldMat = child.material;
                // Replace with a lit MeshStandardMaterial keeping original color if reasonable
                const baseColor = (oldMat && oldMat.color) ? oldMat.color.clone() : new THREE.Color(0x889999);
                // If color is too dark, brighten it
                const luminance = baseColor.r * 0.299 + baseColor.g * 0.587 + baseColor.b * 0.114;
                if (luminance < 0.15) {
                    baseColor.set(0x889999);
                }
                child.material = new THREE.MeshStandardMaterial({
                    color: baseColor,
                    roughness: 0.5,
                    metalness: 0.6,
                    emissive: baseColor.clone().multiplyScalar(0.1)
                });
            }
        });

        shipModelCache = gltf.scene;

        // Auto-scale: measure bounding box and normalize to ~0.5 units
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const modelSize = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
        const targetSize = 0.5;
        const scaleFactor = targetSize / maxDim;
        gltf.scene.scale.set(scaleFactor, scaleFactor, scaleFactor);

        const ship = gltf.scene.clone();
        ship.scale.copy(gltf.scene.scale);
        positionShip(ship, x, z, size);
    }, undefined, (error) => {
        console.warn('[VoidMap] Failed to load ship.glb, using fallback:', error);
        // Fallback: simple box placeholder
        const ship = createFallbackShip();
        positionShip(ship, x, z, size);
    });
}

function positionShip(ship, x, z, size) {
    if (imperialShip) {
        scene.remove(imperialShip);
    }
    imperialShip = ship;
    const shipOffset = size + 0.5;
    imperialShip.position.set(x + shipOffset * 0.6, 0.4, z + shipOffset * 0.3);
    imperialShip.lookAt(0, 0.2, 0);
    scene.add(imperialShip);
}

function createFallbackShip() {
    const ship = new THREE.Group();
    const hull = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.1, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.5, metalness: 0.6 })
    );
    ship.add(hull);
    const engine = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.12, 0.16),
        new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.8 })
    );
    engine.position.set(-0.33, 0, 0);
    ship.add(engine);
    ship.scale.set(0.5, 0.5, 0.5);
    return ship;
}

// ==========================================
//  CAMERA ZOOM FUNCTIONS
// ==========================================

function zoomToPlanet(planetIndex) {
    if (isAnimatingCamera || !planetMeshes[planetIndex]) return;

    const mesh = planetMeshes[planetIndex];
    const planetPos = mesh.position.clone();

    // Camera position: slightly offset from the planet
    const dir = planetPos.clone().normalize();
    const targetCamPos = {
        x: planetPos.x + dir.x * 1.5,
        y: planetPos.y + 1.2,
        z: planetPos.z + dir.z * 1.5
    };
    const targetLookAt = {
        x: planetPos.x,
        y: planetPos.y,
        z: planetPos.z
    };

    animateCamera(targetCamPos, targetLookAt, 800, () => {
        zoomState = 'zoomed';
        controls.autoRotate = false;
        showSummaryPanel(mesh.userData.planeta);
        document.getElementById('btn-zoom-out')?.classList.remove('hidden');
    });
}

function zoomToOverview() {
    if (isAnimatingCamera) return;

    hideSummaryPanel();
    document.getElementById('btn-zoom-out')?.classList.add('hidden');

    animateCamera(OVERVIEW_POS, OVERVIEW_TARGET, 800, () => {
        zoomState = 'overview';
        controls.autoRotate = true;
    });
}

function animateCamera(targetPos, targetLookAt, duration, onComplete) {
    isAnimatingCamera = true;

    const startPos = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z
    };
    const startTarget = {
        x: controls.target.x,
        y: controls.target.y,
        z: controls.target.z
    };
    const startTime = performance.now();

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function tick() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeInOutCubic(progress);

        camera.position.set(
            startPos.x + (targetPos.x - startPos.x) * eased,
            startPos.y + (targetPos.y - startPos.y) * eased,
            startPos.z + (targetPos.z - startPos.z) * eased
        );

        controls.target.set(
            startTarget.x + (targetLookAt.x - startTarget.x) * eased,
            startTarget.y + (targetLookAt.y - startTarget.y) * eased,
            startTarget.z + (targetLookAt.z - startTarget.z) * eased
        );

        controls.update();

        if (progress < 1) {
            requestAnimationFrame(tick);
        } else {
            isAnimatingCamera = false;
            if (onComplete) onComplete();
        }
    }

    requestAnimationFrame(tick);
}

// ==========================================
//  SUMMARY PANEL
// ==========================================

const MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function showSummaryPanel(planeta) {
    const panel = document.getElementById('planet-summary');
    if (!panel) return;

    document.getElementById('summary-name').textContent = planeta.nombre;
    document.getElementById('summary-progress').textContent = `${planeta.progreso}%`;
    document.getElementById('summary-missions').textContent = `${planeta.misionesCompletadas}/${planeta.totalMisiones}`;
    document.getElementById('summary-mes').textContent = MESES_NOMBRES[planeta.numeroMes - 1] || '---';

    const estadoEl = document.getElementById('summary-estado');
    const estadoColors = {
        'conquistado': 'border-green-500 text-green-500',
        'en-conquista': 'border-amber-500 text-amber-500',
        'bloqueado': 'border-red-500 text-red-500',
        'pendiente': 'border-gray-500 text-gray-500'
    };
    estadoEl.className = `text-[10px] font-mono px-2 py-0.5 border ${estadoColors[planeta.estado] || estadoColors.pendiente}`;
    estadoEl.textContent = (planeta.estado || 'pendiente').toUpperCase();

    const link = document.getElementById('summary-link');
    link.href = `planeta-detalle.html?id=${encodeURIComponent(planeta.id)}&año=${planeta.año}`;

    panel.classList.remove('hidden');
}

function hideSummaryPanel() {
    const panel = document.getElementById('planet-summary');
    if (panel) panel.classList.add('hidden');
}

// ==========================================
//  HTML LABEL OVERLAYS
// ==========================================

function updateLabels() {
    const labelsContainer = document.getElementById('planet-labels');
    if (!labelsContainer) return;

    const canvas = renderer.domElement;
    labelsContainer.innerHTML = '';

    // Hide labels when zoomed in on a planet
    if (zoomState === 'zoomed') return;

    planetMeshes.forEach(mesh => {
        const planeta = mesh.userData.planeta;
        const vector = mesh.position.clone().project(camera);

        // Skip if behind camera
        if (vector.z > 1) return;

        const x = (vector.x * 0.5 + 0.5) * canvas.clientWidth;
        const y = (-vector.y * 0.5 + 0.5) * canvas.clientHeight;

        // Skip if outside bounds
        if (x < -20 || x > canvas.clientWidth + 20 || y < -20 || y > canvas.clientHeight + 20) return;

        const label = document.createElement('div');
        label.className = 'planet-label';
        label.style.left = `${x}px`;
        label.style.top = `${y - 20}px`;

        // Depth-based opacity
        const depth = Math.max(0.3, 1 - (vector.z * 0.5));
        label.style.opacity = depth;

        const estadoEmoji = { 'conquistado': '✅', 'en-conquista': '⚔️', 'bloqueado': '🔒', 'pendiente': '⏳' }[planeta.estado] || '⏳';

        label.innerHTML = `
            <div class="text-[9px] font-bold text-secondary tracking-wider whitespace-nowrap">${estadoEmoji} ${planeta.nombre}</div>
            <div class="text-[8px] text-gray-400 font-mono">${planeta.misionesCompletadas}/${planeta.totalMisiones}</div>
            <div class="w-12 h-[3px] bg-[#332224] mx-auto mt-0.5 rounded-full overflow-hidden">
                <div class="h-full bg-secondary rounded-full" style="width:${planeta.progreso}%"></div>
            </div>
        `;

        label.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateToPlanet(planeta);
        });

        labelsContainer.appendChild(label);
    });
}

// ==========================================
//  ANIMATION
// ==========================================

function animate() {
    animationId = requestAnimationFrame(animate);
    controls.update();

    // Update shader sun effect (perlin cubemap + glow + rays)
    updateSunEffect();

    // Imperial ship subtle hover animation
    if (imperialShip) {
        imperialShip.position.y = 0.4 + Math.sin(Date.now() * 0.002) * 0.05;
        imperialShip.rotation.z = Math.sin(Date.now() * 0.001) * 0.03;
    }

    renderer.render(scene, camera);
    updateLabels();
}

function stopAnimation() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

// ==========================================
//  INTERACTION
// ==========================================

let pointerDownTime = 0;
// Track pointer down to distinguish click from drag
document.addEventListener('pointerdown', () => { pointerDownTime = Date.now(); });

function onPlanetClick(event) {
    // Ignore if it was a drag (held > 200ms)
    if (Date.now() - pointerDownTime > 300) return;
    if (isAnimatingCamera) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(planetMeshes);

    if (intersects.length > 0) {
        const mesh = intersects[0].object;
        const planeta = mesh.userData.planeta;

        if (zoomState === 'overview') {
            // Zoom to the clicked planet
            zoomToPlanet(mesh.userData.index);
        } else {
            // Already zoomed - navigate to detail
            navigateToPlanet(planeta);
        }
    }
}

function navigateToPlanet(planeta) {
    window.location.href = `planeta-detalle.html?id=${encodeURIComponent(planeta.id)}&año=${planeta.año}`;
}

function onResize() {
    const container = document.getElementById('three-container');
    if (!container || !renderer) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// ==========================================
//  LINEAR VIEW
// ==========================================

function renderLinearView() {
    const container = document.getElementById('view-linear');
    if (!container) return;

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

    container.innerHTML = planetas.map(p => {
        const isCurrentMonth = p.numeroMes === currentMonth && selectedYear === currentYear;
        const estadoColor = {
            'conquistado': 'bg-green-500',
            'en-conquista': 'bg-amber-500',
            'bloqueado': 'bg-red-500',
            'pendiente': 'bg-gray-600'
        }[p.estado] || 'bg-gray-600';

        const estadoEmoji = { 'conquistado': '✅', 'en-conquista': '⚔️', 'bloqueado': '🔒', 'pendiente': '⏳' }[p.estado] || '⏳';

        return `
        <a href="planeta-detalle.html?id=${encodeURIComponent(p.id)}&año=${p.año}"
           class="flex items-center gap-3 p-3 bg-[#1a1718] border ${isCurrentMonth ? 'border-secondary/50 shadow-[0_0_10px_rgba(197,160,101,0.1)]' : 'border-[#332224]'} hover:bg-[#261e1f] transition-colors">
            <div class="flex-shrink-0 w-8 text-center">
                <div class="text-secondary text-lg font-bold font-display">${String(p.numeroMes).padStart(2,'0')}</div>
                <div class="text-[7px] text-gray-500 uppercase font-mono">${MESES[p.numeroMes-1].substring(0,3)}</div>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <span class="text-white text-sm font-bold">${p.nombre}</span>
                    <span class="text-[10px]">${estadoEmoji}</span>
                    ${isCurrentMonth ? '<span class="text-[7px] text-secondary font-mono border border-secondary/30 px-1">NOW</span>' : ''}
                </div>
                <div class="flex items-center gap-2 mt-1">
                    <div class="flex-1 h-1 bg-[#332224] rounded-full overflow-hidden">
                        <div class="h-full bg-secondary rounded-full transition-all" style="width:${p.progreso}%"></div>
                    </div>
                    <span class="text-[10px] text-gray-400 font-mono">${p.misionesCompletadas}/${p.totalMisiones}</span>
                </div>
            </div>
            <span class="material-symbols-outlined text-gray-600 text-lg">chevron_right</span>
        </a>`;
    }).join('');
}

// ==========================================
//  VIEW TOGGLE
// ==========================================

function toggleView() {
    const view3d = document.getElementById('view-3d');
    const viewLinear = document.getElementById('view-linear');
    const toggleIcon = document.getElementById('toggle-icon');
    const toggleLabel = document.getElementById('toggle-label');

    if (currentView === '3d') {
        currentView = 'linear';
        view3d.classList.add('hidden');
        viewLinear.classList.remove('hidden');
        toggleIcon.textContent = 'language';
        toggleLabel.textContent = '3D MAP';
        stopAnimation();
        hideSummaryPanel();
        document.getElementById('btn-zoom-out')?.classList.add('hidden');
        renderLinearView();
    } else {
        currentView = '3d';
        view3d.classList.remove('hidden');
        viewLinear.classList.add('hidden');
        toggleIcon.textContent = 'view_list';
        toggleLabel.textContent = 'LINEAR';
        animate();
    }
}

// ==========================================
//  YEAR SWITCHING
// ==========================================

function switchYear(año) {
    selectedYear = año;

    // Reset zoom state
    zoomState = 'overview';
    controls.autoRotate = true;
    hideSummaryPanel();
    document.getElementById('btn-zoom-out')?.classList.add('hidden');
    camera.position.set(OVERVIEW_POS.x, OVERVIEW_POS.y, OVERVIEW_POS.z);
    controls.target.set(OVERVIEW_TARGET.x, OVERVIEW_TARGET.y, OVERVIEW_TARGET.z);

    // Clean up imperial ship
    if (imperialShip) {
        scene.remove(imperialShip);
        imperialShip = null;
    }

    // Update pills
    document.querySelectorAll('.year-pill').forEach(btn => {
        if (parseInt(btn.dataset.year) === año) {
            btn.classList.add('year-pill-active');
        } else {
            btn.classList.remove('year-pill-active');
        }
    });

    // Update subtitle
    const subtitle = document.getElementById('system-subtitle');
    if (subtitle) subtitle.textContent = `/// ${SYSTEM_NAMES[año] || 'SISTEMA ' + año} ///`;

    // Reload data
    cargarPlanetas();
}

// ==========================================
//  DATA LOADING (Cache-first pattern)
// ==========================================

async function cargarPlanetas() {
    try {
        setLoading(true);

        const DB = window.WhVaultDB;

        // 1. Try cache first
        if (DB) {
            try {
                const cached = await DB.getCachedData(DB.STORES.PLANETAS);
                if (cached && cached.data && cached.data.length > 0) {
                    const planetasAño = cached.data.filter(p => p.año === selectedYear);
                    if (planetasAño.length > 0) {
                        planetas = planetasAño;
                        renderData();
                        setLoading(false);
                        if (cached.isFresh) return;
                    }
                }
            } catch (e) {
                console.warn('[VoidMap] Cache read error:', e);
            }
        }

        // 2. Fetch from API
        const res = await fetch(`${API_URL}/planetas?año=${selectedYear}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.success && data.planetas) {
            planetas = data.planetas;
            renderData();
            setLoading(false);

            // Cache the data
            if (DB) {
                try {
                    await DB.cacheApiData(DB.STORES.PLANETAS, data.planetas);
                } catch (e) {
                    console.warn('[VoidMap] Cache write error:', e);
                }
            }
        }
    } catch (error) {
        console.error('[VoidMap] Error loading planets:', error);
        if (planetas.length === 0) {
            showError();
        } else {
            showToast('Error refreshing data', 'error');
        }
    }
}

// Window-level reference for the retry button onclick
window.cargarPlanetas = cargarPlanetas;

function renderData() {
    // Update progress summary
    const conquered = planetas.filter(p => p.estado === 'conquistado').length;
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    if (progressBar) progressBar.style.width = `${(conquered / 12) * 100}%`;
    if (progressText) progressText.textContent = `${conquered}/12 CONQUERED`;

    // Create/update 3D planets
    if (scene) {
        createPlanets(planetas);

        // On first load, zoom to current month's planet
        if (firstLoad && selectedYear === new Date().getFullYear()) {
            firstLoad = false;
            const currentMonth = new Date().getMonth(); // 0-indexed = planet index
            // Small delay to let Three.js render first frame
            setTimeout(() => {
                zoomToPlanet(currentMonth);
            }, 300);
        } else if (firstLoad) {
            firstLoad = false;
            // Different year selected - show overview
            zoomState = 'overview';
            controls.autoRotate = true;
        }
    }

    // Update linear view if visible
    if (currentView === 'linear') {
        renderLinearView();
    }
}

// ==========================================
//  INITIALIZATION
// ==========================================

async function init() {
    // Set fecha imperial
    const fechaEl = document.getElementById('fecha-imperial');
    if (fechaEl) fechaEl.textContent = getFechaImperial();

    // Set system subtitle
    const subtitle = document.getElementById('system-subtitle');
    if (subtitle) subtitle.textContent = `/// ${SYSTEM_NAMES[selectedYear] || 'SISTEMA ' + selectedYear} ///`;

    // Init DB
    if (window.WhVaultDB) {
        try {
            await window.WhVaultDB.init();
        } catch (e) {
            console.warn('[VoidMap] DB init error:', e);
        }
    }

    // Setup event listeners
    document.getElementById('view-toggle')?.addEventListener('click', toggleView);
    document.getElementById('btn-zoom-out')?.addEventListener('click', zoomToOverview);

    document.querySelectorAll('.year-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            const año = parseInt(btn.dataset.year);
            if (año && año !== selectedYear) switchYear(año);
        });
    });

    // Init Three.js scene
    initThreeScene();

    // Load data
    await cargarPlanetas();

    // Start animation if in 3D view
    if (currentView === '3d') {
        animate();
    }

    // Connection status
    if (window.WhVaultSync) {
        window.WhVaultSync.updateConnectionStatusUI(navigator.onLine);
        window.addEventListener('online', () => window.WhVaultSync.updateConnectionStatusUI(true));
        window.addEventListener('offline', () => window.WhVaultSync.updateConnectionStatusUI(false));
    }
}

// Wait for DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
