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
let zoomState = 'ship'; // 'ship' | 'docked' | 'engaged' | 'overview'
let isAnimatingCamera = false;
let firstLoad = true;
let lastFrameTime = 0;
let shipPlanetIndex = -1;
let targetingEffect = null;    // Efecto visual de targeting alrededor del pirata

// Dock & Engage system
let dockingTarget = null;       // { type: 'planet'|'pirate', index }
let dockedPlanetIndex = -1;     // Which planet the ship is docked at
let engagedPirataIndex = -1;    // Which pirate the ship is engaged with
let shipNavigatingTo = null;    // 'planet' | 'pirate' | null — currently flying toward
let laserEffect = null;         // THREE.Line beam from ship to pirate
let laserPulseTime = 0;
const DOCK_SHIP_OFFSET = 0.6;   // Distance from planet surface to dock position (lateral)
const ENGAGE_SHIP_OFFSET = 1.5; // Distance from pirate to engage position

// Ship movement — Gothic Armada style (heading-based, inertia, turn rate)
let shipPosition = null; // THREE.Vector3 (initialized after THREE import)
let shipRotation = 0;           // Current facing angle (radians in XZ plane)
let shipVelocity = null; // THREE.Vector3 (actual velocity vector, may differ from heading)
let shipTargetRotation = 0;     // Desired heading toward waypoint
let shipSpeed = 0;              // Current scalar speed
const SHIP_MAX_SPEED = 2.8;     // Max forward speed
const SHIP_THRUST = 2.2;        // Forward acceleration
const SHIP_DECEL = 2.5;         // Friction/deceleration when no thrust
const SHIP_TURN_RATE = 1.6;     // Max radians/sec turning
const SHIP_DRIFT_DAMPING = 3.0; // How fast lateral drift corrects toward heading
const SHIP_BANK_ANGLE = 0.18;   // Max roll (radians) during turns
const SHIP_BANK_SPEED = 3.0;    // How fast banking responds
let shipBank = 0;               // Current visual bank angle
const SHIP_Y = 0.3;
const SHIP_MAX_DIST = 10; // Max distance from origin
const SHIP_ARRIVE_NAV = 0.35;   // Arrival radius for planet/pirate docking
const SHIP_ARRIVE_WP = 0.20;    // Arrival radius for free waypoints

// RTS Camera (top-down angled, free pan/zoom)
const RTS_CAM_HEIGHT = 5.5;    // Height above target (zoomed out default)
const RTS_CAM_ANGLE_Z = 3.0;   // Forward offset (creates angle)
const RTS_CLOSE_HEIGHT = 0.9;  // Close zoom (focus ship / undock / disengage)
const RTS_CLOSE_ANGLE_Z = 1.4; // Close zoom forward offset (3/4 view angle)

// Waypoint navigation (click-to-move)
let shipWaypoint = null;    // THREE.Vector3 target, null = idle
let waypointMarker = null;  // Visual ring at target

// Today's missions HUD
let todaysMissions = [];

// Engine glow
let engineGlow = null;

// Three.js objects
let scene, camera, renderer, controls;
let planetMeshes = [];
let raycaster, mouse;
let animationId;
let centralStar;
let imperialShip;
let sunEffect = null;
let selectedPlanet = null; // Track currently selected planet for sidebar

// Criterios de Victoria y Misiones (sprites sobre el planeta actual)
let directivaSignals = [];      // Array de THREE.Sprite
let pirataGroups = [];          // Array de THREE.Group
let directivasData = [];        // Criterios de Victoria del mes actual
let misionesSecundariasData = []; // Datos API (max 8)

// Camera positions
const OVERVIEW_POS = { x: 0, y: 10, z: 14 };
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
    const labelsEl = document.getElementById('planet-labels');

    if (loading) {
        loadingEl.classList.remove('hidden');
        errorEl.classList.add('hidden');
        view3d.classList.add('hidden');
        if (labelsEl) labelsEl.style.display = 'none';
    } else {
        loadingEl.classList.add('hidden');
        if (labelsEl) labelsEl.style.display = '';
        view3d.classList.remove('hidden');
    }
}

function showError() {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
    document.getElementById('error-state').classList.add('flex');
    document.getElementById('view-3d').classList.add('hidden');
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

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0b); // fallback while skybox loads

    // Camera
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 10, 14);
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
    controls.enablePan = true;
    controls.panSpeed = 1.5;
    controls.screenSpacePanning = false; // Pan parallel to ground plane
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

    // Orbit rings created per-planet in createPlanets()

    // Skybox sphere (space nebula background)
    createSkybox();

    // Ship position/velocity vectors
    shipPosition = new THREE.Vector3();
    shipVelocity = new THREE.Vector3();

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
        depthWrite: false, depthTest: true, side: THREE.DoubleSide,
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
let orbitLines = [];

// Seeded random for consistent planet positioning across reloads
function seededRandom(seed) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

// Pre-computed radii: alternating inner/outer bands for organic layout
const PLANET_RADII = [
    3.8, 6.2, 2.8, 5.5, 4.2, 7.0,
    3.0, 6.8, 4.8, 2.5, 5.8, 3.5
];

function createPlanets(planetasData) {
    // Clear existing planets
    planetMeshes.forEach(m => {
        scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
    });
    planetMeshes = [];

    // Clear existing orbit lines and route
    orbitLines.forEach(o => {
        scene.remove(o);
        o.geometry.dispose();
        o.material.dispose();
    });
    orbitLines = [];

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const maxMissions = Math.max(...planetasData.map(p => p.totalMisiones || 1), 1);

    planetasData.forEach((planeta, index) => {
        // Alternating radii with slight jitter
        const baseRadius = PLANET_RADII[index % 12];
        const radiusJitter = (seededRandom(index * 3 + 7) - 0.5) * 0.4;
        const radius = baseRadius + radiusJitter;

        // Even angular spacing with slight variance
        const baseAngle = (index / 12) * Math.PI * 2 - Math.PI / 2;
        const angleJitter = (seededRandom(index * 5 + 13) - 0.5) * 0.3;
        const angle = baseAngle + angleJitter;

        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        // Draw orbit line (thin transparent gray circle)
        const orbitGeo = new THREE.RingGeometry(radius - 0.015, radius + 0.015, 96);
        const orbitMat = new THREE.MeshBasicMaterial({
            color: 0x555555, side: THREE.DoubleSide,
            transparent: true, opacity: 0.1
        });
        const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat);
        orbitMesh.rotation.x = -Math.PI / 2;
        scene.add(orbitMesh);
        orbitLines.push(orbitMesh);

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
        // Kepler's 3rd law: angular velocity ω ∝ r^(-3/2) — steep falloff for far planets
        // r=2.5 → ~0.006 rad/s (orbit ~17min), r=7.0 → ~0.001 rad/s (orbit ~80min)
        const orbitSpeed = 0.025 * Math.pow(radius, -1.5) + seededRandom(index * 17 + 1) * 0.001;
        // Spin: highly varied like real solar system (Jupiter 10h vs Venus 243d)
        const spinRand = seededRandom(index * 11 + 3);
        const spinSpeed = 0.01 + spinRand * spinRand * 0.25; // quadratic curve: most slow, few fast
        mesh.userData = { planeta, index, orbitRadius: radius, orbitAngle: angle, orbitSpeed, spinSpeed };

        // Golden ring for current month
        if (planeta.numeroMes === currentMonth && selectedYear === currentYear) {
            const ringGeometry = new THREE.TorusGeometry(size + 0.12, 0.025, 8, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xc5a065 });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.rotation.x = Math.PI / 2;
            mesh.add(ring);

            // Imperial Ship starts at current planet but moves freely
            shipPlanetIndex = index;
            if (!imperialShip) {
                shipPosition.set(x, SHIP_Y, z);
                shipRotation = Math.atan2(x, z); // Face toward center initially
                loadImperialShip(x, z, size);
            }
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
    // Position at ship's free-roaming location
    if (shipPosition) {
        imperialShip.position.copy(shipPosition);
    } else {
        imperialShip.position.set(x, SHIP_Y, z);
    }
    imperialShip.rotation.y = shipRotation;
    scene.add(imperialShip);

    // Add engine glow after ship is placed
    addEngineGlow();
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
//  DIRECTIVA SIGNALS (NEW)
// ==========================================

function createDirectivaSignals() {
    // Limpiar markers existentes
    directivaSignals.forEach(group => {
        if (group.parent) group.parent.remove(group);
        group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
    });
    directivaSignals = [];

    if (directivasData.length === 0) return;

    const currentMonth  = new Date().getMonth() + 1;
    const currentYear   = new Date().getFullYear();
    const currentPlanet = planetMeshes.find(m =>
        m.userData.planeta &&
        m.userData.planeta.numeroMes === currentMonth &&
        selectedYear === currentYear
    );
    if (!currentPlanet) return;

    const planetSize      = currentPlanet.geometry.parameters.radius;
    const activeCriterios = directivasData.filter(d => !d.completada);
    const total           = activeCriterios.length;
    const goldenAngle     = Math.PI * (3 - Math.sqrt(5));

    const prioridadHex = {
        'critica': 0xdc2626,
        'alta':    0xf97316,
        'media':   0xc5a065,
        'baja':    0x3b82f6
    };

    const hexR    = planetSize * 0.26;   // Radio del hexágono
    const spriteS = hexR * 1.10;         // Tamaño del plano águila

    activeCriterios.forEach((criterio, index) => {
        const colorHex = prioridadHex[criterio.prioridad] || 0xc5a065;
        const seed     = hashString(criterio.id || `criterio-${index}`);
        const group    = new THREE.Group();

        // — 1. spinGroup: contenedor plano para hexágono (gira sobre la normal de la superficie) —
        // RingGeometry/CircleGeometry por defecto están en el plano XY.
        // El grupo tiene Y = normal de la superficie → sin corrección el hexágono quedaría vertical.
        // Solución: rotation.x = PI/2 lo pone en el plano XZ (plano tangente = horizontal).
        const spinGroup = new THREE.Group();
        group.add(spinGroup);

        // Relleno hexagonal blanco sutil
        const discMat = new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.18,
            side: THREE.DoubleSide, depthWrite: false
        });
        const discMesh = new THREE.Mesh(new THREE.CircleGeometry(hexR * 0.78, 6), discMat);
        discMesh.rotation.x = Math.PI / 2;
        spinGroup.add(discMesh);

        // — 2. Anillo hexagonal (borde de la zona) —
        const ringMat = new THREE.MeshBasicMaterial({
            color: colorHex, transparent: true, opacity: 0.75,
            side: THREE.DoubleSide, depthWrite: false
        });
        const ringMesh = new THREE.Mesh(
            new THREE.RingGeometry(hexR * 0.70, hexR, 6), ringMat
        );
        ringMesh.rotation.x = Math.PI / 2;
        spinGroup.add(ringMesh);

        // — 3. Plano con águila (mismo plano que el hexágono, perpendicular a la normal) —
        const c = document.createElement('canvas');
        c.width = 128; c.height = 128;
        // Canvas transparente (sin fondo circular) — el águila se carga en onload
        const aquilaTexture = new THREE.CanvasTexture(c);
        const aquilaMat = new THREE.MeshBasicMaterial({
            map: aquilaTexture, transparent: true, depthWrite: false,
            side: THREE.DoubleSide
        });
        const aquilaPlane = new THREE.Mesh(new THREE.PlaneGeometry(spriteS, spriteS), aquilaMat);
        aquilaPlane.rotation.x = Math.PI / 2;
        aquilaPlane.position.y = 0.01;   // offset mínimo sobre el disco (evita z-fighting)
        spinGroup.add(aquilaPlane);

        // — Posición Fibonacci + orientación perpendicular a la superficie —
        const theta = index * goldenAngle;
        const phi   = Math.acos(1 - 2 * (index + 0.5) / Math.max(total, 1));
        const nx = Math.sin(phi) * Math.cos(theta);
        const ny = Math.cos(phi);
        const nz = Math.sin(phi) * Math.sin(theta);
        group.position.set(nx * planetSize, ny * planetSize, nz * planetSize);
        group.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(nx, ny, nz)
        );

        currentPlanet.add(group);
        group.userData = {
            type:        'criterio-zone',
            directiva:   criterio,
            planetIndex: currentPlanet.userData.index,
            spinGroup, ringMesh, aquilaPlane, aquilaTexture,
            floatOffset: (seed % 628) / 100
        };
        directivaSignals.push(group);
    });

    // Cargar águila y pintar encima del círculo de color
    const aquilaImg = new Image();
    aquilaImg.src = '/assets/aquila.svg';
    aquilaImg.onload = () => {
        directivaSignals.forEach(({ userData }) => {
            const { aquilaPlane, aquilaTexture } = userData;
            if (!aquilaPlane) return;
            const c = document.createElement('canvas');
            c.width = 128; c.height = 128;
            const ctx = c.getContext('2d');
            // Solo el águila blanca sobre fondo transparente (mantener aspecto)
            ctx.globalAlpha = 1.0;
            ctx.filter = 'brightness(10) contrast(1.5)';
            const iw = aquilaImg.naturalWidth || 128;
            const ih = aquilaImg.naturalHeight || 128;
            const asp = iw / ih;
            let dx, dy, dw, dh;
            if (asp >= 1) { dw = 112; dh = 112 / asp; dx = (128 - dw) / 2; dy = (128 - dh) / 2; }
            else           { dh = 112; dw = 112 * asp; dy = (128 - dh) / 2; dx = (128 - dw) / 2; }
            ctx.drawImage(aquilaImg, dx, dy, dw, dh);
            const newTex = new THREE.CanvasTexture(c);
            aquilaTexture.dispose();
            aquilaPlane.material.map = newTex;
            aquilaPlane.material.needsUpdate = true;
            userData.aquilaTexture = newTex;
        });
    };

    console.log(`[VoidMap] Created ${directivaSignals.length} criterio markers`);
}

function updateDirectivaSignals(delta) {
    const now = performance.now() / 1000;

    directivaSignals.forEach(group => {
        const { spinGroup, ringMesh, floatOffset } = group.userData || {};
        if (!spinGroup) return;

        // Rotación lenta del hexágono alrededor de la normal de la superficie
        spinGroup.rotation.y += delta * 0.22;

        // Pulso de opacidad en el anillo hexagonal
        if (ringMesh) {
            const pulse = 0.5 + 0.5 * Math.sin(now * 1.4 + floatOffset);
            ringMesh.material.opacity = 0.45 + 0.35 * pulse;
        }
    });
}

// ==========================================
//  PIRATA SHIPS (NEW)
// ==========================================

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

function createPirataShips() {
    // Limpiar piratas existentes
    pirataGroups.forEach(p => {
        scene.remove(p);
        p.children.forEach(c => {
            if (c.material && c.material.map) c.material.map.dispose();
            if (c.material) c.material.dispose();
            if (c.geometry) c.geometry.dispose();
        });
    });
    pirataGroups = [];

    if (misionesSecundariasData.length === 0) {
        console.log('[VoidMap] No secondary missions to display');
        return;
    }

    console.log(`[VoidMap] Creating ${misionesSecundariasData.length} pirata ships`);

    misionesSecundariasData.forEach((mision, index) => {
        // Triángulo (nave pirata)
        const triangleGeo = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            0, 0.4, 0,      // punta arriba (increased from 0.15)
            -0.25, -0.25, 0,  // izquierda abajo (increased from -0.1)
            0.25, -0.25, 0    // derecha abajo (increased from 0.1)
        ]);
        triangleGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        triangleGeo.setIndex([0, 1, 2]);

        const triangleMat = new THREE.MeshBasicMaterial({
            color: 0x990000,
            side: THREE.DoubleSide,
            depthTest: true,  // Respetar profundidad
            depthWrite: false
        });
        const triangleMesh = new THREE.Mesh(triangleGeo, triangleMat);

        // Calavera sprite
        const skullCanvas = document.createElement('canvas');
        skullCanvas.width = 32;
        skullCanvas.height = 32;
        const sCtx = skullCanvas.getContext('2d');
        sCtx.font = '24px monospace';
        sCtx.fillText('☠️', 4, 24);

        const skullTexture = new THREE.CanvasTexture(skullCanvas);
        const skullMat = new THREE.SpriteMaterial({
            map: skullTexture,
            depthTest: true,  // Respetar profundidad
            depthWrite: false
        });
        const skullSprite = new THREE.Sprite(skullMat);
        skullSprite.scale.set(0.3, 0.3, 1); // Increased from 0.12
        skullSprite.position.set(0, 0.5, 0); // Adjusted for larger triangle

        // Collider invisible (esfera más grande para facilitar clicks)
        const colliderGeo = new THREE.SphereGeometry(0.6, 8, 8);
        const colliderMat = new THREE.MeshBasicMaterial({
            visible: false,
            depthTest: true,
            depthWrite: false
        });
        const collider = new THREE.Mesh(colliderGeo, colliderMat);

        // Grupo pirata
        const group = new THREE.Group();
        group.add(collider);      // Collider primero (para raycasting)
        group.add(triangleMesh);
        group.add(skullSprite);

        // Posición pseudorandom pero consistente (usando hash del ID)
        const seed = hashString(mision.id || `mision-${index}`);
        const radius = 3.5 + (seed % 300) / 100; // 3.5 a 6.5
        const angle = ((seed % 360) / 360) * Math.PI * 2;

        group.position.set(
            Math.cos(angle) * radius,
            (seed % 100) / 100 - 0.5, // -0.5 a 0.5
            Math.sin(angle) * radius
        );

        group.userData = {
            type: 'pirata',
            mision: mision,
            spinSpeed: 0.3,
            floatOffset: seed / 100,
            baseY: group.position.y
        };

        scene.add(group);
        pirataGroups.push(group);
    });

    console.log(`[VoidMap] Created ${pirataGroups.length} pirata ships`);
}

function updatePiratas(delta, now) {
    pirataGroups.forEach(group => {
        // Rotación en Y (spin pirata)
        group.rotation.y += group.userData.spinSpeed * delta;

        // Movimiento flotante sutil
        const floatTime = now * 0.001 + group.userData.floatOffset;
        group.position.y = group.userData.baseY + Math.sin(floatTime) * 0.05;
    });
}

function updateVisualsVisibility() {
    pirataGroups.forEach((g, index) => {
        if (zoomState === 'ship' || zoomState === 'overview') {
            g.visible = true;
        } else if (zoomState === 'engaged') {
            g.visible = (index === engagedPirataIndex);
        } else {
            g.visible = false; // Hidden when docked
        }
    });

    directivaSignals.forEach(sprite => {
        const signalPlanetIndex = sprite.userData.planetIndex;
        sprite.visible = (zoomState === 'docked' && dockedPlanetIndex === signalPlanetIndex);
    });
}

// ==========================================
//  DOCK & ENGAGE NAVIGATION
// ==========================================

/**
 * Compute live dock/engage position (planets orbit, so recalculate each frame)
 */
function computeNavigationTarget() {
    if (!dockingTarget) return null;

    if (dockingTarget.type === 'planet') {
        const mesh = planetMeshes[dockingTarget.index];
        if (!mesh) return null;
        const planetPos = mesh.position;
        const planetRadius = mesh.geometry?.parameters?.radius || 0.5;
        // Perpendicular (lateral) offset — rotate radial direction 90° around Y
        const radial = new THREE.Vector3(planetPos.x, 0, planetPos.z).normalize();
        const lateral = new THREE.Vector3(-radial.z, 0, radial.x); // 90° CW rotation in XZ
        const offset = planetRadius + DOCK_SHIP_OFFSET;
        return new THREE.Vector3(
            planetPos.x + lateral.x * offset,
            SHIP_Y,
            planetPos.z + lateral.z * offset
        );
    }

    if (dockingTarget.type === 'pirate') {
        const group = pirataGroups[dockingTarget.index];
        if (!group) return null;
        const toShip = new THREE.Vector3()
            .subVectors(shipPosition, group.position);
        toShip.y = 0;
        toShip.normalize();
        return new THREE.Vector3(
            group.position.x + toShip.x * ENGAGE_SHIP_OFFSET,
            SHIP_Y,
            group.position.z + toShip.z * ENGAGE_SHIP_OFFSET
        );
    }

    return null;
}

/**
 * Start flying ship toward a planet for docking
 */
function initiateDockAtPlanet(planetIndex) {
    if (!planetMeshes[planetIndex]) return;
    if (shipNavigatingTo !== null) return;

    shipWaypoint = null;
    removeWaypointMarker();
    hideSummaryPanel();
    hideTargetingEffect();
    destroyLaserEffect();
    hideMissionsHUD();

    dockingTarget = { type: 'planet', index: planetIndex };
    dockedPlanetIndex = planetIndex;
    engagedPirataIndex = -1;
    shipNavigatingTo = 'planet';

    if (zoomState === 'overview') {
        controls.autoRotate = false;
        animateCamera(
            { x: shipPosition.x, y: shipPosition.y + RTS_CAM_HEIGHT, z: shipPosition.z + RTS_CAM_ANGLE_Z },
            { x: shipPosition.x, y: shipPosition.y, z: shipPosition.z },
            500,
            () => { zoomState = 'ship'; showShipUI(); }
        );
    }
}

/**
 * Called when ship arrives at planet dock position
 */
function onShipArrivedAtPlanet(planetIndex) {
    const mesh = planetMeshes[planetIndex];
    if (!mesh) return;

    // Orient ship to face planet
    const planetPos = mesh.position;
    shipTargetRotation = Math.atan2(planetPos.x - shipPosition.x, planetPos.z - shipPosition.z);

    // Camera flies to orbit position around planet
    const dir = new THREE.Vector3(planetPos.x, 0, planetPos.z).normalize();
    const targetCamPos = {
        x: planetPos.x + dir.x * 3.5,
        y: planetPos.y + 2.8,
        z: planetPos.z + dir.z * 3.5
    };
    const targetLookAt = { x: planetPos.x, y: planetPos.y, z: planetPos.z };

    hideShipUI();

    animateCamera(targetCamPos, targetLookAt, 800, () => {
        zoomState = 'docked';
        controls.enabled = true;
        controls.autoRotate = false;
        showSummaryPanel(mesh.userData.planeta);
        updateVisualsVisibility();
        updatePanelButtonLabels();
    });
}

/**
 * Instant dock at planet (for initial load, no ship flight)
 */
function dockAtPlanet(planetIndex) {
    const mesh = planetMeshes[planetIndex];
    if (!mesh) return;

    const planetPos = mesh.position;
    const planetRadius = mesh.geometry?.parameters?.radius || 0.5;
    // Perpendicular (lateral) offset — same as computeNavigationTarget
    const radial = new THREE.Vector3(planetPos.x, 0, planetPos.z).normalize();
    const lateral = new THREE.Vector3(-radial.z, 0, radial.x);
    const offset = planetRadius + DOCK_SHIP_OFFSET;

    shipPosition.set(
        planetPos.x + lateral.x * offset,
        SHIP_Y,
        planetPos.z + lateral.z * offset
    );

    if (imperialShip) {
        imperialShip.position.copy(shipPosition);
        shipTargetRotation = Math.atan2(planetPos.x - shipPosition.x, planetPos.z - shipPosition.z);
        shipRotation = shipTargetRotation;
        imperialShip.rotation.set(0, shipRotation, 0);
    }

    dockedPlanetIndex = planetIndex;
    engagedPirataIndex = -1;

    const dir = new THREE.Vector3(planetPos.x, 0, planetPos.z).normalize();
    camera.position.set(
        planetPos.x + dir.x * 3.5,
        planetPos.y + 2.8,
        planetPos.z + dir.z * 3.5
    );
    controls.target.set(planetPos.x, planetPos.y, planetPos.z);
    controls.update();

    zoomState = 'docked';
    hideMissionsHUD();
    hideShipUI();
    showSummaryPanel(mesh.userData.planeta);
    updateVisualsVisibility();
    updatePanelButtonLabels();
}

/**
 * Undock from planet — return to free movement
 */
function undock() {
    if (zoomState !== 'docked' || isAnimatingCamera) return;

    hideSummaryPanel();
    dockedPlanetIndex = -1;
    shipNavigatingTo = null;
    dockingTarget = null;

    const targetCamPos = {
        x: shipPosition.x,
        y: shipPosition.y + RTS_CLOSE_HEIGHT,
        z: shipPosition.z + RTS_CLOSE_ANGLE_Z
    };
    const targetLookAt = {
        x: shipPosition.x,
        y: shipPosition.y,
        z: shipPosition.z
    };

    animateCamera(targetCamPos, targetLookAt, 700, () => {
        zoomState = 'ship';
        controls.enabled = true;
        controls.autoRotate = false;
        showMissionsHUD();
        showShipUI();
        updateVisualsVisibility();
    });
}

/**
 * Start flying ship toward a pirate for engagement
 */
function initiateEngageWithPirate(pirataIndex) {
    if (!pirataGroups[pirataIndex]) return;
    if (shipNavigatingTo !== null) return;

    shipWaypoint = null;
    removeWaypointMarker();
    hideSummaryPanel();
    hideTargetingEffect();
    destroyLaserEffect();
    hideMissionsHUD();

    dockingTarget = { type: 'pirate', index: pirataIndex };
    engagedPirataIndex = pirataIndex;
    dockedPlanetIndex = -1;
    shipNavigatingTo = 'pirate';

    if (zoomState === 'overview') {
        controls.autoRotate = false;
        animateCamera(
            { x: shipPosition.x, y: shipPosition.y + RTS_CAM_HEIGHT, z: shipPosition.z + RTS_CAM_ANGLE_Z },
            { x: shipPosition.x, y: shipPosition.y, z: shipPosition.z },
            500,
            () => { zoomState = 'ship'; showShipUI(); }
        );
    }
}

/**
 * Called when ship arrives at pirate engage position
 */
function onShipArrivedAtPirate(pirataIndex) {
    const group = pirataGroups[pirataIndex];
    if (!group) return;

    // Orient ship to face pirate
    const dx = group.position.x - shipPosition.x;
    const dz = group.position.z - shipPosition.z;
    shipTargetRotation = Math.atan2(dx, dz);

    const pirataPos = group.position.clone();
    const dir = new THREE.Vector3(dx, 0, dz).normalize();

    const targetCamPos = {
        x: pirataPos.x + dir.x * 2.5,
        y: pirataPos.y + 1.8,
        z: pirataPos.z + dir.z * 2.5
    };
    const targetLookAt = { x: pirataPos.x, y: pirataPos.y, z: pirataPos.z };

    hideShipUI();

    animateCamera(targetCamPos, targetLookAt, 800, () => {
        zoomState = 'engaged';
        controls.enabled = true;
        controls.autoRotate = false;
        showPirataSummaryPanel(group.userData.mision);
        showTargetingEffect(pirataIndex);
        createLaserEffect();
        updateVisualsVisibility();
        updatePanelButtonLabels();
    });
}

/**
 * Disengage from pirate — return to free movement
 */
function disengage() {
    if (zoomState !== 'engaged' || isAnimatingCamera) return;

    hideSummaryPanel();
    hideTargetingEffect();
    destroyLaserEffect();
    engagedPirataIndex = -1;
    shipNavigatingTo = null;
    dockingTarget = null;

    const targetCamPos = {
        x: shipPosition.x,
        y: shipPosition.y + RTS_CLOSE_HEIGHT,
        z: shipPosition.z + RTS_CLOSE_ANGLE_Z
    };
    const targetLookAt = {
        x: shipPosition.x,
        y: shipPosition.y,
        z: shipPosition.z
    };

    animateCamera(targetCamPos, targetLookAt, 700, () => {
        zoomState = 'ship';
        controls.enabled = true;
        controls.autoRotate = false;
        showMissionsHUD();
        showShipUI();
        updateVisualsVisibility();
    });
}

function zoomToOverview() {
    if (isAnimatingCamera) return;

    shipWaypoint = null;
    removeWaypointMarker();
    hideSummaryPanel();
    hideTargetingEffect();
    destroyLaserEffect();
    hideMissionsHUD();

    dockedPlanetIndex = -1;
    engagedPirataIndex = -1;
    shipNavigatingTo = null;
    dockingTarget = null;

    animateCamera(OVERVIEW_POS, OVERVIEW_TARGET, 800, () => {
        zoomState = 'overview';
        controls.enabled = true;
        controls.autoRotate = true;
        showShipUI();
        updateVisualsVisibility();
    });
}

window._voidmapZoomToOverview = zoomToOverview;
window._voidmapInitiateEngage = initiateEngageWithPirate;
window._voidmapInitiateDock = initiateDockAtPlanet;
window._voidmapUndock = undock;
window._voidmapDisengage = disengage;

/**
 * Universal back function — dispatches based on current state
 */
function returnToShip() {
    if (isAnimatingCamera) return;
    if (zoomState === 'docked') { undock(); return; }
    if (zoomState === 'engaged') { disengage(); return; }
    if (zoomState === 'overview') { focusShip(); return; }
    focusShip();
}

/**
 * Update UNDOCK/DISENGAGE button label in summary panel
 */
function updatePanelButtonLabels() {
    const btn = document.getElementById('btn-back-to-ship');
    if (!btn) return;

    if (zoomState === 'docked') {
        btn.innerHTML = '<span class="material-symbols-outlined text-sm">logout</span> UNDOCK';
    } else if (zoomState === 'engaged') {
        btn.innerHTML = '<span class="material-symbols-outlined text-sm">gps_off</span> DISENGAGE';
    } else {
        btn.innerHTML = '<span class="material-symbols-outlined text-sm">rocket_launch</span> RETURN TO SHIP';
    }
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

    // Desktop: interceptar click para abrir sidebar en lugar de navegar
    link.onclick = (e) => {
        if (window.innerWidth >= 1024) {
            e.preventDefault();
            navigateToPlanet(planeta);
        }
        // Mobile: dejar navegación normal (no preventDefault)
    };

    panel.classList.remove('hidden');
}

function hideSummaryPanel() {
    const panel = document.getElementById('planet-summary');
    if (panel) panel.classList.add('hidden');
}

function showPirataSummaryPanel(mision) {
    // Reusar el planet-summary panel pero con contenido de misión
    const panel = document.getElementById('planet-summary');
    if (!panel) return;

    const prioridadColors = {
        'critica': 'border-red-500 text-red-500',
        'alta': 'border-orange-500 text-orange-500',
        'media': 'border-amber-500 text-amber-500',
        'baja': 'border-blue-500 text-blue-500'
    };

    document.getElementById('summary-name').textContent = '☠️ ' + mision.titulo;
    document.getElementById('summary-progress').textContent = mision['puntos-xp'] || '---';
    document.getElementById('summary-missions').textContent = 'XP';
    document.getElementById('summary-mes').textContent = mision.categoria || 'pirata';

    const estadoEl = document.getElementById('summary-estado');
    estadoEl.className = `text-[10px] font-mono px-2 py-0.5 border ${prioridadColors[mision.prioridad] || prioridadColors.media}`;
    estadoEl.textContent = (mision.prioridad || 'media').toUpperCase();

    const link = document.getElementById('summary-link');
    link.href = `index.html?highlight=${encodeURIComponent(mision.id)}`;
    link.textContent = 'TRACK MISSION';
    link.onclick = null; // Navegación normal

    panel.classList.remove('hidden');
}

function showTargetingEffect(pirataIndex) {
    hideTargetingEffect(); // Limpiar efecto anterior

    const group = pirataGroups[pirataIndex];
    if (!group) return;

    // Crear anillos de targeting (bullseye)
    const ring1 = createTargetingRing(0.8, 0xff0000);
    const ring2 = createTargetingRing(1.2, 0xff4444);
    const ring3 = createTargetingRing(1.6, 0xff8888);

    const targetingGroup = new THREE.Group();
    targetingGroup.add(ring1);
    targetingGroup.add(ring2);
    targetingGroup.add(ring3);

    targetingGroup.position.copy(group.position);
    targetingGroup.userData = {
        type: 'targeting',
        pirataIndex: pirataIndex,
        rings: [ring1, ring2, ring3]
    };

    scene.add(targetingGroup);
    targetingEffect = targetingGroup;
}

function createTargetingRing(radius, color) {
    const geometry = new THREE.RingGeometry(radius - 0.02, radius + 0.02, 32);
    const material = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
        depthTest: false
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = Math.PI / 2;
    return ring;
}

function hideTargetingEffect() {
    if (targetingEffect) {
        scene.remove(targetingEffect);
        targetingEffect.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        targetingEffect = null;
    }
}

// ==========================================
//  HTML LABEL OVERLAYS
// ==========================================

function updateLabels() {
    const labelsContainer = document.getElementById('planet-labels');
    if (!labelsContainer) return;

    const canvas = renderer.domElement;
    labelsContainer.innerHTML = '';

    // Show labels only in ship mode and overview
    if (zoomState === 'docked' || zoomState === 'engaged') return;

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
            if (zoomState === 'ship' || zoomState === 'overview') {
                initiateDockAtPlanet(mesh.userData.index);
            }
        });

        labelsContainer.appendChild(label);
    });
}

// ==========================================
//  ANIMATION
// ==========================================

function animate() {
    animationId = requestAnimationFrame(animate);

    const now = performance.now();
    const delta = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.1) : 0.016;
    lastFrameTime = now;

    // OrbitControls always active (RTS camera)
    controls.update();

    // Update shader sun effect (perlin cubemap + glow + rays)
    updateSunEffect();

    // Animate planet orbits and self-rotation
    updatePlanetOrbits(delta);

    // Ship waypoint navigation
    updateShipMovement(delta);

    // Camera orbits around ship (ship mode)
    if (zoomState === 'ship' && imperialShip && shipPosition && !isAnimatingCamera) {
        const offset = camera.position.clone().sub(controls.target);
        controls.target.copy(shipPosition);
        camera.position.copy(shipPosition).add(offset);
    }

    // Animate directiva signals
    updateDirectivaSignals(delta);

    // Animate pirata ships
    updatePiratas(delta, now);

    // Camera follows orbiting planet while docked
    if (zoomState === 'docked' && dockedPlanetIndex >= 0 && !isAnimatingCamera) {
        const mesh = planetMeshes[dockedPlanetIndex];
        if (mesh) {
            const offset = camera.position.clone().sub(controls.target);
            controls.target.copy(mesh.position);
            camera.position.copy(mesh.position).add(offset);
        }
    }

    // Camera follows pirate while engaged + laser + targeting
    if (zoomState === 'engaged' && engagedPirataIndex >= 0 && !isAnimatingCamera) {
        const group = pirataGroups[engagedPirataIndex];
        if (group) {
            const offset = camera.position.clone().sub(controls.target);
            controls.target.copy(group.position);
            camera.position.copy(group.position).add(offset);

            if (targetingEffect) {
                targetingEffect.position.copy(group.position);
                const pulse = Math.sin(now * 0.002) * 0.1;
                targetingEffect.userData.rings.forEach((ring, i) => {
                    ring.material.opacity = 0.6 + pulse * (1 - i * 0.2);
                });
            }
        }
        updateLaserEffect(delta);
    }

    renderer.render(scene, camera);
    updateLabels();
}

/**
 * Update planet orbital movement and self-rotation
 */
function updatePlanetOrbits(delta) {
    for (const mesh of planetMeshes) {
        const { orbitRadius, orbitAngle, orbitSpeed, spinSpeed } = mesh.userData;

        // Update orbital angle
        mesh.userData.orbitAngle = orbitAngle + orbitSpeed * delta;

        // Recompute position on orbit
        mesh.position.x = Math.cos(mesh.userData.orbitAngle) * orbitRadius;
        mesh.position.z = Math.sin(mesh.userData.orbitAngle) * orbitRadius;

        // Self-rotation (spin on Y axis)
        mesh.rotation.y += spinSpeed * delta;
    }
}

/**
 * Ship movement: free waypoint (ship mode) + tracking waypoint (navigating to dock/engage)
 */
function updateShipMovement(delta) {
    if (!imperialShip || !shipPosition) return;

    const isNavigating = shipNavigatingTo !== null;
    if (zoomState !== 'ship' && !isNavigating) return;

    let hasTarget = false;
    let targetX = 0, targetZ = 0, distToTarget = 0, arriveRadius = 0;

    if (isNavigating) {
        // TRACKING WAYPOINT: recompute target each frame (planets orbit!)
        const effectiveTarget = computeNavigationTarget();
        if (effectiveTarget) {
            targetX = effectiveTarget.x - shipPosition.x;
            targetZ = effectiveTarget.z - shipPosition.z;
            distToTarget = Math.sqrt(targetX * targetX + targetZ * targetZ);
            arriveRadius = SHIP_ARRIVE_NAV;
            hasTarget = true;
        }
    } else if (shipWaypoint) {
        targetX = shipWaypoint.x - shipPosition.x;
        targetZ = shipWaypoint.z - shipPosition.z;
        distToTarget = Math.sqrt(targetX * targetX + targetZ * targetZ);
        arriveRadius = SHIP_ARRIVE_WP;
        hasTarget = true;
    }

    // --- ARRIVAL CHECK ---
    if (hasTarget && distToTarget < arriveRadius) {
        if (isNavigating) {
            shipSpeed = 0;
            shipVelocity.set(0, 0, 0);
            shipWaypoint = null;
            removeWaypointMarker();
            const navType = shipNavigatingTo;
            const targetIndex = dockingTarget?.index;
            shipNavigatingTo = null;
            if (navType === 'planet') onShipArrivedAtPlanet(targetIndex);
            else if (navType === 'pirate') onShipArrivedAtPirate(targetIndex);
            return;
        } else {
            shipWaypoint = null;
            removeWaypointMarker();
            hasTarget = false;
        }
    }

    // --- HEADING-BASED STEERING ---
    let turnDelta = 0;
    if (hasTarget && distToTarget > 0.05) {
        // Desired heading toward target
        shipTargetRotation = Math.atan2(targetX / distToTarget, targetZ / distToTarget);

        // Angular difference (shortest path)
        let angleDiff = shipTargetRotation - shipRotation;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Turn toward target at limited rate
        const maxTurn = SHIP_TURN_RATE * delta;
        turnDelta = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
        shipRotation += turnDelta;

        // Normalize rotation
        while (shipRotation > Math.PI) shipRotation -= Math.PI * 2;
        while (shipRotation < -Math.PI) shipRotation += Math.PI * 2;

        // Throttle control: slow down when facing away, or when approaching target
        const facingAlignment = Math.cos(angleDiff); // 1=facing, -1=opposite
        const approachBrake = Math.min(distToTarget / 2.0, 1.0); // Decelerate near target
        const throttle = Math.max(0, facingAlignment) * approachBrake;

        // Accelerate forward along CURRENT heading
        shipSpeed += SHIP_THRUST * throttle * delta;
        shipSpeed = Math.min(shipSpeed, SHIP_MAX_SPEED);

        // If facing very wrong, also apply some braking
        if (facingAlignment < 0.2) {
            shipSpeed *= Math.max(0, 1 - SHIP_DECEL * 0.5 * delta);
        }
    } else {
        // No target — coast and decelerate
        shipSpeed *= Math.max(0, 1 - SHIP_DECEL * delta);
        if (shipSpeed < 0.01) shipSpeed = 0;
    }

    // --- VELOCITY: blend heading direction with inertia ---
    // Ship's heading vector (where the bow points)
    const headX = Math.sin(shipRotation);
    const headZ = Math.cos(shipRotation);

    // Desired velocity along heading
    const desiredVelX = headX * shipSpeed;
    const desiredVelZ = headZ * shipSpeed;

    // Drift damping: gradually align actual velocity with heading (simulates lateral thruster correction)
    shipVelocity.x += (desiredVelX - shipVelocity.x) * SHIP_DRIFT_DAMPING * delta;
    shipVelocity.z += (desiredVelZ - shipVelocity.z) * SHIP_DRIFT_DAMPING * delta;

    // Apply velocity
    shipPosition.x += shipVelocity.x * delta;
    shipPosition.z += shipVelocity.z * delta;
    shipPosition.y = SHIP_Y;

    // Clamp to system bounds
    const dist = Math.sqrt(shipPosition.x ** 2 + shipPosition.z ** 2);
    if (dist > SHIP_MAX_DIST) {
        shipPosition.x *= SHIP_MAX_DIST / dist;
        shipPosition.z *= SHIP_MAX_DIST / dist;
    }

    // --- VISUAL: banking on turns ---
    const targetBank = -(turnDelta / (SHIP_TURN_RATE * delta || 1)) * SHIP_BANK_ANGLE;
    shipBank += (targetBank - shipBank) * SHIP_BANK_SPEED * delta;

    // Apply to Three.js object
    imperialShip.position.copy(shipPosition);
    imperialShip.position.y += Math.sin(Date.now() * 0.0008) * 0.015; // hover bob
    imperialShip.rotation.set(0, shipRotation, shipBank);

    // Engine glow intensity based on speed
    if (engineGlow) {
        engineGlow.intensity = (shipSpeed / SHIP_MAX_SPEED) * 2;
    }

    // Animate waypoint marker (rotate outer ring + pulse)
    if (waypointMarker) {
        const outer = waypointMarker.getObjectByName('wp-outer');
        if (outer) {
            outer.rotation.z += 0.015;
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
            outer.material.opacity = 0.3 + 0.35 * pulse;
        }
    }
}

function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * Math.min(t, 1);
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

    // Detectar beacons de criterios (recursive=true para detectar meshes hijo)
    const signalIntersects = raycaster.intersectObjects(directivaSignals, true);
    if (signalIntersects.length > 0) {
        // Subir la jerarquía hasta encontrar el grupo con userData.type === 'criterio-zone'
        // (mesh → spinGroup → group, necesita dos .parent)
        let targetNode = signalIntersects[0].object;
        while (targetNode && targetNode.userData?.type !== 'criterio-zone') {
            targetNode = targetNode.parent;
        }
        const group = targetNode;
        if (group && group.userData && group.userData.directiva) {
            // Solo clickeable si el beacon está en la cara visible del planeta
            const beaconWorldPos = new THREE.Vector3();
            group.getWorldPosition(beaconWorldPos);

            const planetMesh = planetMeshes[group.userData.planetIndex];
            if (planetMesh) {
                const normal = new THREE.Vector3()
                    .subVectors(beaconWorldPos, planetMesh.position)
                    .normalize();
                const viewDir = new THREE.Vector3()
                    .subVectors(camera.position, beaconWorldPos)
                    .normalize();

                if (normal.dot(viewDir) > 0) {
                    showDirectivaModal(group.userData.directiva);
                    return;
                }
            }
        }
    }

    // Detectar piratas (NUEVO) - ahora con collider invisible
    const pirataColliders = pirataGroups.map(g => g.children[0]); // El collider es children[0]
    const pirataIntersects = raycaster.intersectObjects(pirataColliders);
    if (pirataIntersects.length > 0) {
        const collider = pirataIntersects[0].object;
        const pirataIndex = pirataGroups.findIndex(g => g.children[0] === collider);
        if (pirataIndex >= 0) {
            initiateEngageWithPirate(pirataIndex);
            return;
        }
    }

    // Detectar planetas (existente)
    const intersects = raycaster.intersectObjects(planetMeshes);

    if (intersects.length > 0) {
        const mesh = intersects[0].object;

        if (zoomState === 'ship' || zoomState === 'overview') {
            initiateDockAtPlanet(mesh.userData.index);
        }
        // When docked/engaged, navigation only via UNDOCK/DISENGAGE
        return;
    }

    // Nothing hit — click-to-move (ship mode only)
    if (zoomState === 'ship') {
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SHIP_Y);
        const intersectPoint = new THREE.Vector3();
        const hit = raycaster.ray.intersectPlane(groundPlane, intersectPoint);
        if (hit) {
            // Clamp to system bounds
            const d = Math.sqrt(intersectPoint.x ** 2 + intersectPoint.z ** 2);
            if (d > SHIP_MAX_DIST) {
                intersectPoint.x *= SHIP_MAX_DIST / d;
                intersectPoint.z *= SHIP_MAX_DIST / d;
            }
            shipWaypoint = intersectPoint.clone();
            placeWaypointMarker(intersectPoint);
        }
    }
}

function navigateToPlanet(planeta) {
    // Desktop: cargar en sidebar
    if (window.innerWidth >= 1024) {
        selectedPlanet = planeta; // Save selected planet for reopening panel
        openPlanetSidebar(planeta.id, planeta.año);
    } else {
        // Mobile: navegación normal
        window.location.href = `planeta-detalle.html?id=${encodeURIComponent(planeta.id)}&año=${planeta.año}`;
    }
}

/**
 * Open planet detail in desktop sidebar (desktop only)
 */
async function openPlanetSidebar(planetaId, año) {
    const sidebar = document.getElementById('desktop-sidebar');
    const content = document.getElementById('sidebar-content');

    if (!sidebar || !content) return;

    // Show loading state
    content.innerHTML = '<div class="flex items-center justify-center h-full min-h-screen"><span class="text-secondary font-mono text-sm animate-pulse">/// LOADING ///</span></div>';
    sidebar.classList.add('open');

    // Hide planet summary panel when sidebar opens
    hideSummaryPanel();

    try {
        // Fetch planet data from API
        const response = await fetch(`/api/planetas/${encodeURIComponent(planetaId)}?año=${año}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load planet');
        }

        const planeta = data.planeta;
        const misiones = planeta.misiones || [];
        const stats = planeta.stats || {};

        // Build sidebar content HTML
        const progreso = planeta.progreso || 0;
        const totalMisiones = misiones.length;
        const completadas = stats.totalCompleted || 0;

        content.innerHTML = `
            <!-- Planet Header -->
            <div class="mb-6 pb-6 border-b border-[#332224]">
                <h1 class="text-2xl font-bold text-secondary mb-2">${planeta.nombre}</h1>
                <p class="text-gray-400 text-sm mb-4">${planeta.mes} ${planeta.año}</p>

                <!-- Progress Stats -->
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="bg-[#1a1718] border border-[#332224] p-3 rounded">
                        <div class="text-xs text-gray-500 mb-1">CONQUERED</div>
                        <div class="text-xl font-bold text-secondary">${progreso}%</div>
                    </div>
                    <div class="bg-[#1a1718] border border-[#332224] p-3 rounded">
                        <div class="text-xs text-gray-500 mb-1">MISSIONS</div>
                        <div class="text-xl font-bold text-secondary">${completadas}/${totalMisiones}</div>
                    </div>
                    <div class="bg-[#1a1718] border border-[#332224] p-3 rounded">
                        <div class="text-xs text-gray-500 mb-1">XP EARNED</div>
                        <div class="text-xl font-bold text-green-500">${stats.xpEarned || 0}</div>
                    </div>
                    <div class="bg-[#1a1718] border border-[#332224] p-3 rounded">
                        <div class="text-xs text-gray-500 mb-1">XP PENDING</div>
                        <div class="text-xl font-bold text-yellow-500">${stats.xpPending || 0}</div>
                    </div>
                </div>

                <!-- Estado Badge -->
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500">STATUS:</span>
                    <span class="px-3 py-1 rounded-sm text-xs font-mono ${getEstadoBadgeClass(planeta.estado)}">${planeta.estado.toUpperCase()}</span>
                </div>

                <!-- Change Estado Button -->
                <button id="sidebar-change-estado" class="mt-3 w-full py-2 bg-[#1a1718] border border-[#332224] hover:border-primary/50 text-gray-400 hover:text-primary text-sm font-mono transition-colors rounded-sm">
                    CHANGE STATUS
                </button>
            </div>

            <!-- Objetivo del Mes -->
            ${planeta.objetivoMes ? `
            <div class="mb-6 p-4 bg-[#1a1718] border border-[#332224] rounded">
                <h2 class="text-sm font-mono text-secondary mb-2">/// MONTHLY OBJECTIVE ///</h2>
                <p class="text-gray-300 text-sm">${planeta.objetivoMes}</p>
            </div>
            ` : ''}

            <!-- Missions List -->
            <div>
                <h2 class="text-sm font-mono text-secondary mb-3">/// MISSIONS (${totalMisiones}) ///</h2>
                ${misiones.length === 0 ? `
                    <p class="text-gray-500 text-sm italic">No missions scheduled</p>
                ` : `
                    <div class="space-y-2">
                        ${misiones.map(mision => `
                            <div class="p-3 bg-[#1a1718] border border-[#332224] rounded ${mision.completada ? 'opacity-50' : ''}">
                                <div class="flex items-start justify-between gap-2 mb-1">
                                    <h3 class="text-sm font-medium ${mision.completada ? 'line-through text-gray-500' : 'text-gray-200'}">${mision.titulo || mision.id}</h3>
                                    ${mision['criterio-victoria'] ? '<span class="material-symbols-outlined text-primary text-sm">stars</span>' : ''}
                                </div>
                                <div class="flex items-center gap-3 text-xs text-gray-500">
                                    ${mision.deadline ? `<span>${formatDate(mision.deadline)}</span>` : ''}
                                    ${mision['puntos-xp'] ? `<span class="text-secondary">${mision['puntos-xp']} XP</span>` : ''}
                                    ${mision.prioridad ? `<span class="px-2 py-0.5 rounded-sm ${getPrioridadClass(mision.prioridad)}">${mision.prioridad}</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;

        // Add event listener for change estado button
        const changeEstadoBtn = content.querySelector('#sidebar-change-estado');
        if (changeEstadoBtn) {
            changeEstadoBtn.addEventListener('click', () => showEstadoModal(planeta));
        }

        console.log(`[Sidebar] Loaded planet detail: ${planetaId}, ${completadas}/${totalMisiones} missions, ${progreso}% progress`);

    } catch (error) {
        console.error('[Sidebar] Error loading planet detail:', error);
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full min-h-screen gap-4">
                <p class="text-primary font-mono text-sm">/// ERROR LOADING PLANET ///</p>
                <p class="text-gray-500 text-xs">${error.message}</p>
            </div>
        `;
    }
}

/**
 * Get CSS class for estado badge
 */
function getEstadoBadgeClass(estado) {
    switch (estado) {
        case 'conquistado':
            return 'bg-green-500/20 text-green-400 border border-green-500/30';
        case 'en-conquista':
            return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
        case 'bloqueado':
            return 'bg-red-500/20 text-red-400 border border-red-500/30';
        default:
            return 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
    }
}

/**
 * Get CSS class for prioridad badge
 */
function getPrioridadClass(prioridad) {
    switch (prioridad) {
        case 'critica':
            return 'bg-red-500/20 text-red-400';
        case 'alta':
            return 'bg-orange-500/20 text-orange-400';
        case 'media':
            return 'bg-yellow-500/20 text-yellow-400';
        case 'baja':
            return 'bg-blue-500/20 text-blue-400';
        default:
            return 'bg-gray-500/20 text-gray-400';
    }
}

/**
 * Format date string (YYYY-MM-DD -> MMM DD)
 */
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Show modal to change planet estado
 */
async function showEstadoModal(planeta) {
    const estados = [
        { value: 'pendiente', label: 'Pendiente', color: 'gray' },
        { value: 'en-conquista', label: 'En Conquista', color: 'yellow' },
        { value: 'conquistado', label: 'Conquistado', color: 'green' },
        { value: 'bloqueado', label: 'Bloqueado', color: 'red' }
    ];

    const modalHTML = `
        <div id="estado-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-[#161011] border border-[#332224] rounded-lg p-6 max-w-md w-full">
                <h2 class="text-xl font-bold text-secondary mb-4">Change Planet Status</h2>
                <p class="text-gray-400 text-sm mb-6">${planeta.nombre}</p>

                <div class="space-y-2 mb-6">
                    ${estados.map(e => `
                        <button class="estado-option w-full p-3 text-left border rounded transition-all ${
                            planeta.estado === e.value
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-[#332224] bg-[#1a1718] text-gray-300 hover:border-gray-500'
                        }" data-estado="${e.value}">
                            <span class="font-mono">${e.label}</span>
                        </button>
                    `).join('')}
                </div>

                <div class="flex gap-3">
                    <button id="modal-cancel" class="flex-1 py-2 bg-[#1a1718] border border-[#332224] text-gray-400 hover:border-gray-500 transition-colors rounded">
                        Cancel
                    </button>
                    <button id="modal-confirm" class="flex-1 py-2 bg-primary border border-primary text-white hover:bg-primary/80 transition-colors rounded">
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('estado-modal');
    let selectedEstado = planeta.estado;

    // Estado option clicks
    modal.querySelectorAll('.estado-option').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedEstado = btn.dataset.estado;
            modal.querySelectorAll('.estado-option').forEach(b => {
                b.classList.remove('border-primary', 'bg-primary/10', 'text-primary');
                b.classList.add('border-[#332224]', 'bg-[#1a1718]', 'text-gray-300');
            });
            btn.classList.remove('border-[#332224]', 'bg-[#1a1718]', 'text-gray-300');
            btn.classList.add('border-primary', 'bg-primary/10', 'text-primary');
        });
    });

    // Cancel
    modal.querySelector('#modal-cancel').addEventListener('click', () => {
        modal.remove();
    });

    // Confirm
    modal.querySelector('#modal-confirm').addEventListener('click', async () => {
        if (selectedEstado === planeta.estado) {
            modal.remove();
            return;
        }

        try {
            const response = await fetch(`/api/planetas/${planeta.id}/estado?año=${planeta.año}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: selectedEstado })
            });

            const result = await response.json();

            if (result.success) {
                showToast(`Planet status updated to: ${selectedEstado}`, 'success');
                modal.remove();

                // Reload sidebar with updated data
                openPlanetSidebar(planeta.id, planeta.año);

                // Reload planets in background to update 3D view
                cargarPlanetas();
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('[Estado] Error updating:', error);
            showToast('Failed to update status', 'error');
        }
    });
}

/**
 * Close desktop sidebar
 */
function closePlanetSidebar() {
    const sidebar = document.getElementById('desktop-sidebar');
    if (sidebar) {
        sidebar.classList.remove('open');
    }

    // Show planet summary panel again when sidebar closes (only if a planet is selected)
    if (selectedPlanet) {
        showSummaryPanel(selectedPlanet);
    }
}

// ==========================================
//  MODALES DE DIRECTIVAS Y PIRATAS (NEW)
// ==========================================

function showDirectivaModal(criterio) {
    const prioridadColors = {
        'critica': '#dc2626',
        'alta': '#f97316',
        'media': '#c5a065',
        'baja': '#3b82f6'
    };
    const priorColor = prioridadColors[criterio.prioridad] || '#c5a065';
    const completada = criterio.completada;
    const deadline = criterio.deadline || '';
    const statusText = completada ? 'COMPLETADO' : (deadline ? `Deadline: ${deadline}` : 'PENDIENTE');
    const statusColor = completada ? '#22c55e' : '#a0a0a0';

    const modalHTML = `
        <div id="directiva-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="pointer-events: auto;">
            <div class="bg-[#161011] border border-[#332224] rounded-lg p-6 max-w-md w-full">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex-1 min-w-0">
                        <div class="text-[10px] font-mono mb-1" style="color:${priorColor}">/// CRITERIO DE VICTORIA ///</div>
                        <h2 class="text-lg font-bold text-white leading-snug">${criterio.titulo || 'Criterio'}</h2>
                    </div>
                    <button id="close-modal" class="text-gray-500 hover:text-white ml-3 flex-shrink-0">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div class="flex items-center gap-2 mb-3 flex-wrap">
                    <span class="text-[10px] font-mono px-2 py-0.5 border rounded" style="color:${priorColor}; border-color:${priorColor};">${(criterio.prioridad || 'media').toUpperCase()}</span>
                    <span class="text-[10px] font-mono" style="color:${statusColor}">${statusText}</span>
                </div>

                ${criterio.categoria ? `
                    <div class="text-[10px] text-gray-600 font-mono uppercase tracking-widest">${criterio.categoria}</div>
                ` : ''}
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('close-modal').addEventListener('click', () => {
        document.getElementById('directiva-modal').remove();
    });

    document.getElementById('directiva-modal').addEventListener('click', (e) => {
        if (e.target.id === 'directiva-modal') {
            document.getElementById('directiva-modal').remove();
        }
    });
}

function showPirataModal(mision) {
    const prioridadColors = {
        'critica': 'text-red-500',
        'alta': 'text-orange-500',
        'media': 'text-yellow-500',
        'baja': 'text-blue-500'
    };

    const modalHTML = `
        <div id="pirata-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="pointer-events: auto;">
            <div class="bg-[#161011] border border-[#332224] rounded-lg p-6 max-w-md w-full">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">☠️</span>
                        <h2 class="text-xl font-bold text-white">Misión Secundaria</h2>
                    </div>
                    <button id="close-pirata-modal" class="text-gray-500 hover:text-white">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div class="mb-4">
                    <h3 class="text-lg font-bold text-secondary mb-2">${mision.titulo || 'Misión'}</h3>
                    <div class="flex items-center gap-3 text-xs">
                        <span class="px-2 py-1 rounded-sm ${prioridadColors[mision.prioridad] || 'text-gray-400'} bg-black/30 border border-current uppercase font-bold">
                            ${(mision.prioridad || 'media').toUpperCase()}
                        </span>
                        ${mision['puntos-xp'] ? `<span class="text-secondary">${mision['puntos-xp']} XP</span>` : ''}
                        ${mision.deadline ? `<span class="text-gray-400">${mision.deadline}</span>` : ''}
                    </div>
                </div>

                <button id="track-mision" class="w-full py-2 bg-primary border border-primary text-white hover:bg-primary/80 transition-colors rounded font-bold uppercase">
                    TRACK MISSION
                </button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('close-pirata-modal').addEventListener('click', () => {
        document.getElementById('pirata-modal').remove();
    });

    document.getElementById('track-mision').addEventListener('click', () => {
        // Redirigir a Bridge con la misión seleccionada
        window.location.href = `index.html?highlight=${encodeURIComponent(mision.id)}`;
    });

    document.getElementById('pirata-modal').addEventListener('click', (e) => {
        if (e.target.id === 'pirata-modal') {
            document.getElementById('pirata-modal').remove();
        }
    });
}

function onResize() {
    if (!renderer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// ==========================================
//  YEAR SWITCHING
// ==========================================

function switchYear(año) {
    selectedYear = año;

    // Reset zoom state
    zoomState = 'overview';
    controls.enabled = true;
    controls.autoRotate = true;
    hideSummaryPanel();
    hideMissionsHUD();
    hideShipUI();
    hideTargetingEffect();
    destroyLaserEffect();
    dockedPlanetIndex = -1;
    engagedPirataIndex = -1;
    shipNavigatingTo = null;
    dockingTarget = null;
    shipWaypoint = null;
    removeWaypointMarker();
    camera.position.set(OVERVIEW_POS.x, OVERVIEW_POS.y, OVERVIEW_POS.z);
    controls.target.set(OVERVIEW_TARGET.x, OVERVIEW_TARGET.y, OVERVIEW_TARGET.z);
    shipPosition.set(0, SHIP_Y, 0);
    shipVelocity.set(0, 0, 0);
    shipSpeed = 0;
    shipBank = 0;

    // Clean up imperial ship
    if (imperialShip) {
        scene.remove(imperialShip);
        imperialShip = null;
    }

    // Clean up criterio zone markers (attached to planets)
    directivaSignals.forEach(group => {
        if (group.parent) group.parent.remove(group);
        group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
    });
    directivaSignals = [];
    directivasData = [];

    // Clean up pirata ships
    pirataGroups.forEach(group => {
        scene.remove(group);
        group.children.forEach(child => {
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
            if (child.geometry) child.geometry.dispose();
        });
    });
    pirataGroups = [];
    misionesSecundariasData = [];

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

                        // Load directivas and misiones even with cached planets
                        await Promise.all([
                            cargarDirectivas(),
                            cargarMisionesSecundarias(),
                            loadTodaysMissions()
                        ]);

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

            // Cache the data
            if (DB) {
                try {
                    await DB.cacheApiData(DB.STORES.PLANETAS, data.planetas);
                } catch (e) {
                    console.warn('[VoidMap] Cache write error:', e);
                }
            }

            // Load directivas and misiones in parallel
            await Promise.all([
                cargarDirectivas(),
                cargarMisionesSecundarias()
            ]);

            renderData();
            setLoading(false);
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

        // Create directiva signals (NEW)
        createDirectivaSignals();

        // Create pirata ships (NEW)
        createPirataShips();

        // On first load, dock at current month's planet
        if (firstLoad && selectedYear === new Date().getFullYear()) {
            firstLoad = false;
            setTimeout(() => {
                renderMissionsHUD();
                if (shipPlanetIndex >= 0) {
                    dockAtPlanet(shipPlanetIndex);
                } else {
                    // No current month planet — fallback to ship mode
                    zoomState = 'ship';
                    controls.enabled = true;
                    controls.autoRotate = false;
                    if (shipPosition) {
                        camera.position.set(shipPosition.x, shipPosition.y + RTS_CAM_HEIGHT, shipPosition.z + RTS_CAM_ANGLE_Z);
                        controls.target.set(shipPosition.x, shipPosition.y, shipPosition.z);
                    }
                    showMissionsHUD();
                    showShipUI();
                    updateVisualsVisibility();
                }
            }, 300);
        } else if (firstLoad) {
            firstLoad = false;
            zoomState = 'overview';
            controls.enabled = true;
            controls.autoRotate = true;
        }
    }

}

// ==========================================
//  DIRECTIVAS & MISIONES SECUNDARIAS FETCH
// ==========================================

async function cargarDirectivas() {
    try {
        const DB = window.WhVaultDB;

        // Cache-first
        if (DB) {
            try {
                const cached = await DB.getCachedData(DB.STORES.MISIONES_CRITERIOS);
                if (cached && cached.data) {
                    directivasData = cached.data;
                    if (cached.isFresh) return;
                }
            } catch (e) {
                console.warn('[VoidMap] Criterios cache error:', e);
            }
        }

        // Fetch criterios de victoria del mes actual
        const res = await fetch(`${API_URL}/misiones/criterios-victoria`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.success && data.misiones) {
            directivasData = data.misiones;
            console.log(`[VoidMap] Loaded ${directivasData.length} criterios de victoria`);

            // Cache
            if (DB) {
                try {
                    await DB.cacheApiData(DB.STORES.MISIONES_CRITERIOS, data.misiones);
                } catch (e) {
                    console.warn('[VoidMap] Criterios cache write error:', e);
                }
            }
        }
    } catch (error) {
        console.warn('[VoidMap] Error loading criterios:', error);
        directivasData = [];
    }
}

async function cargarMisionesSecundarias() {
    try {
        const DB = window.WhVaultDB;

        // Cache-first
        if (DB) {
            try {
                const cached = await DB.getCachedData(DB.STORES.MISIONES_OPCIONALES);
                if (cached && cached.data) {
                    // Ordenar por prioridad y limitar a 8
                    const sorted = cached.data.sort((a, b) => {
                        const prioOrder = { 'critica': 0, 'alta': 1, 'media': 2, 'baja': 3 };
                        return (prioOrder[a.prioridad] || 4) - (prioOrder[b.prioridad] || 4);
                    });
                    misionesSecundariasData = sorted.slice(0, 8);
                    if (cached.isFresh) return;
                }
            } catch (e) {
                console.warn('[VoidMap] Misiones cache error:', e);
            }
        }

        // Fetch from API
        const res = await fetch(`${API_URL}/misiones/opcionales`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.success && data.misiones) {
            // Ordenar por prioridad y limitar a 8
            const sorted = data.misiones.sort((a, b) => {
                const prioOrder = { 'critica': 0, 'alta': 1, 'media': 2, 'baja': 3 };
                return (prioOrder[b.prioridad] || 4) - (prioOrder[a.prioridad] || 4);
            });
            misionesSecundariasData = sorted.slice(0, 8);
            console.log(`[VoidMap] Loaded ${misionesSecundariasData.length} secondary missions`);

            // Cache
            if (DB) {
                try {
                    await DB.cacheApiData(DB.STORES.MISIONES_OPCIONALES, data.misiones);
                } catch (e) {
                    console.warn('[VoidMap] Misiones cache write error:', e);
                }
            }
        }
    } catch (error) {
        console.warn('[VoidMap] Error loading secondary missions:', error);
        misionesSecundariasData = [];
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
            await window.WhVaultDB.initDB();
        } catch (e) {
            console.warn('[VoidMap] DB init error:', e);
        }
    }

    // Setup event listeners
    document.getElementById('btn-back-to-ship')?.addEventListener('click', returnToShip);

    document.querySelectorAll('.year-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            const año = parseInt(btn.dataset.year);
            if (año && año !== selectedYear) switchYear(año);
        });
    });

    // Init Three.js scene
    initThreeScene();

    // Setup keyboard shortcuts
    setupKeyboard();

    // Load data (planets + today's missions in parallel)
    await cargarPlanetas();

    // Start animation
    animate();

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

// ==========================================
//  KEYBOARD & SHIP UI
// ==========================================

function setupKeyboard() {
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
            if (zoomState === 'docked') undock();
            else if (zoomState === 'engaged') disengage();
            else if (zoomState === 'overview') focusShip();
        }
    });
}

function showShipUI() {
    const btns = document.getElementById('ship-mode-buttons');
    if (btns) btns.classList.remove('hidden');
}

function hideShipUI() {
    const btns = document.getElementById('ship-mode-buttons');
    if (btns) btns.classList.add('hidden');
}

// ==========================================
//  WAYPOINT MARKER
// ==========================================

function placeWaypointMarker(point) {
    removeWaypointMarker();

    const WP_COLOR = 0x55ccff;  // Cyan-blue (RTS style)
    const baseMat = { transparent: true, depthWrite: false, side: THREE.DoubleSide };

    const group = new THREE.Group();
    group.position.set(point.x, SHIP_Y + 0.01, point.z);
    group.rotation.x = -Math.PI / 2;

    // Outer thin ring (rotates)
    const outerRing = new THREE.Mesh(
        new THREE.RingGeometry(0.05, 0.058, 32),
        new THREE.MeshBasicMaterial({ ...baseMat, color: WP_COLOR, opacity: 0.6 })
    );
    outerRing.name = 'wp-outer';
    group.add(outerRing);

    // Inner dot
    const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.008, 12),
        new THREE.MeshBasicMaterial({ ...baseMat, color: WP_COLOR, opacity: 0.8 })
    );
    group.add(dot);

    // 4 crosshair ticks
    const tickGeo = new THREE.PlaneGeometry(0.002, 0.018);
    const tickMat = new THREE.MeshBasicMaterial({ ...baseMat, color: WP_COLOR, opacity: 0.5 });
    for (let i = 0; i < 4; i++) {
        const tick = new THREE.Mesh(tickGeo, tickMat);
        const angle = (Math.PI / 2) * i;
        const dist = 0.032;
        tick.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
        tick.rotation.z = angle;
        group.add(tick);
    }

    scene.add(group);
    waypointMarker = group;
}

function removeWaypointMarker() {
    if (waypointMarker) {
        scene.remove(waypointMarker);
        waypointMarker.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        waypointMarker = null;
    }
}

// ==========================================
//  FOCUS SHIP (re-center camera)
// ==========================================

function focusShip() {
    if (!imperialShip || !shipPosition || isAnimatingCamera) return;

    // From docked/engaged, use their specific exit logic first
    if (zoomState === 'docked') { undock(); return; }
    if (zoomState === 'engaged') { disengage(); return; }

    // From ship or overview — fly close to ship
    const wasOverview = zoomState === 'overview';
    const targetCamPos = {
        x: shipPosition.x,
        y: shipPosition.y + RTS_CLOSE_HEIGHT,
        z: shipPosition.z + RTS_CLOSE_ANGLE_Z
    };
    const targetLookAt = {
        x: shipPosition.x,
        y: shipPosition.y,
        z: shipPosition.z
    };
    animateCamera(targetCamPos, targetLookAt, wasOverview ? 800 : 600, () => {
        zoomState = 'ship';
        controls.enabled = true;
        controls.autoRotate = false;
        if (wasOverview) {
            showMissionsHUD();
            showShipUI();
            updateVisualsVisibility();
        }
    });
}

window._voidmapFocusShip = focusShip;

// ==========================================
//  TODAY'S MISSIONS HUD
// ==========================================

async function loadTodaysMissions() {
    try {
        const res = await fetch(`${API_URL}/misiones/urgentes`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.success && data.misiones) {
            todaysMissions = data.misiones.slice(0, 6);
        }
    } catch (error) {
        console.warn('[VoidMap] Error loading today missions:', error);
        todaysMissions = [];
    }
}

function renderMissionsHUD() {
    const list = document.getElementById('hud-missions-list');
    const count = document.getElementById('hud-mission-count');
    if (!list || !count) return;

    count.textContent = todaysMissions.length;

    if (todaysMissions.length === 0) {
        list.innerHTML = '<div class="px-3 py-3 text-center text-gray-600 text-[10px] font-mono">NO ACTIVE THREATS</div>';
        return;
    }

    const hoy = getHoy();
    list.innerHTML = todaysMissions.map(m => {
        const xp = m['puntos-xp'] || 0;
        const isOverdue = m.deadline && m.deadline < hoy;
        return `
            <div class="flex items-center gap-2 px-3 py-2">
                <div class="w-1 h-6 rounded-full flex-shrink-0 ${isOverdue ? 'bg-primary' : 'bg-secondary'}"></div>
                <div class="flex-1 min-w-0">
                    <div class="text-xs text-gray-200 truncate">${m.titulo}</div>
                    <div class="flex items-center gap-2 text-[9px]">
                        ${isOverdue ? '<span class="text-primary font-mono">OVERDUE</span>' : '<span class="text-gray-500 font-mono">TODAY</span>'}
                        ${xp ? `<span class="text-secondary">+${xp}XP</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getHoy() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

function showMissionsHUD() {
    const el = document.getElementById('missions-hud');
    if (el) el.classList.remove('hidden');
}

function hideMissionsHUD() {
    const el = document.getElementById('missions-hud');
    if (el) el.classList.add('hidden');
    // Also close the panel when hiding the whole HUD
    const panel = document.getElementById('missions-hud-panel');
    if (panel) panel.classList.add('hidden');
}

function toggleMissionsPanel() {
    const panel = document.getElementById('missions-hud-panel');
    if (panel) panel.classList.toggle('hidden');
}

window._voidmapToggleMissionsPanel = toggleMissionsPanel;

// ==========================================
//  ENGINE GLOW
// ==========================================

function addEngineGlow() {
    if (!imperialShip || engineGlow) return;
    engineGlow = new THREE.PointLight(0x4488ff, 0, 1.5);
    engineGlow.position.set(-0.3, 0, 0);
    imperialShip.add(engineGlow);
}

// ==========================================
//  LASER EFFECT (engaged state)
// ==========================================

function createLaserEffect() {
    destroyLaserEffect();
    if (engagedPirataIndex < 0 || !pirataGroups[engagedPirataIndex]) return;

    const mat = new THREE.MeshBasicMaterial({
        color: 0xff2200,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const geo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1);
    laserEffect = new THREE.Mesh(geo, mat);
    laserEffect.renderOrder = 5;
    laserEffect.frustumCulled = false;
    scene.add(laserEffect);
    laserPulseTime = 0;
}

function updateLaserEffect(delta) {
    if (!laserEffect || engagedPirataIndex < 0) return;
    const pirataGroup = pirataGroups[engagedPirataIndex];
    if (!pirataGroup || !shipPosition) return;

    laserPulseTime += delta;

    const start = shipPosition.clone();
    const end = pirataGroup.position.clone();
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dir = end.clone().sub(start);
    const length = dir.length();

    laserEffect.position.copy(mid);
    laserEffect.scale.y = length;
    laserEffect.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.normalize()
    );

    // Pulse opacity
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(laserPulseTime * 8));
    laserEffect.material.opacity = pulse;
}

function destroyLaserEffect() {
    if (laserEffect) {
        scene.remove(laserEffect);
        laserEffect.geometry?.dispose();
        laserEffect.material?.dispose();
        laserEffect = null;
    }
}

// Desktop sidebar close handler
document.addEventListener('DOMContentLoaded', () => {
    const sidebarCloseBtn = document.getElementById('sidebar-close');
    if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener('click', closePlanetSidebar);
    }
});
