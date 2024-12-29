import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import WebGL from './vendor/WebGL.js';

const noiseVertexShader = `
precision highp float;

attribute vec2 uv;
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}

`;

const noiseFragmentShader = `
precision highp float;

varying vec2 vUv;
uniform float uTime;

vec2 hash2d(vec2 pos) {
    vec2 pos2 = vec2(
        dot(pos.xy, vec2(334.1, 781.7)),
        dot(pos.xy, vec2(652.5, 153.3))
    );
    return vec2(
        -1.0 + 3.0 * fract(sin(pos2.x) * 241.5453123),
        -1.0 + 3.0 * fract(sin(pos2.y) * 241.5453123)
    );
}

float perlin(vec2 pos) {
    vec2 i = floor(pos);
    vec2 f = fract(pos);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float n00 = dot(hash2d(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
    float n10 = dot(hash2d(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float n01 = dot(hash2d(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float n11 = dot(hash2d(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

    float nx0 = mix(n00, n10, u.x);
    float nx1 = mix(n01, n11, u.x);

    return 0.5 + 0.5 * mix(nx0, nx1, u.y);
}

void main() {
    vec2 noisePos = vUv * 10.0 + vec2(uTime * 0.1, 0.0);
    float noise = perlin(noisePos);

    // Offsets for sampling neighboring points
    float epsilon = 0.1;

    // Sample nearby height values
    float heightL = perlin(noisePos + vec2(-epsilon, 0.0)) * 0.3; // Left
    float heightR = perlin(noisePos + vec2(epsilon, 0.0)) * 0.3;  // Right
    float heightD = perlin(noisePos + vec2(0.0, -epsilon)) * 0.3; // Down
    float heightU = perlin(noisePos + vec2(0.0, epsilon)) * 0.3;  // Up

    // Create tangent vectors in the x and y directions
    vec3 tangentX = vec3(2.0 * epsilon, 0.0, heightR - heightL);
    vec3 tangentY = vec3(0.0, 2.0 * epsilon, heightU - heightD);

    // Compute the normal using the cross product
    vec3 normal = normalize(cross(tangentX, tangentY));

    gl_FragColor = vec4(normal.xyz, noise);
}
`;

// Inspired: https://threejs.org/examples/webgl_shaders_ocean.html
const waterVertexShader = `
precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform sampler2D uNoiseTexture;
uniform float uWaveHeight;
uniform mat4 uMirrorTextureMatrix;

varying vec2 vUv;
varying vec3 vNormal;
varying vec4 vWorldPosition;
varying vec4 vMirrorCoord;

void main() {
    vUv = uv;

    vec4 noise = texture2D(uNoiseTexture, uv);
    vNormal = noise.rgb;
    float height = noise.a;

    vWorldPosition = modelMatrix * vec4(position.xy, height * uWaveHeight, 1.0);
    vMirrorCoord = uMirrorTextureMatrix * vWorldPosition;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, height * uWaveHeight, 1.0);
}
`;

const waterFragmentShader = `
    precision highp float;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec4 vWorldPosition;
    varying vec4 vMirrorCoord;

    uniform vec3 uCameraPosition;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform vec3 uWaterColor;
    uniform mat4 modelMatrix;
    uniform sampler2D uWaveTexture;
    uniform float uTime;
    uniform sampler2D uMirrorTexture;
    uniform float uWaveHeight;
 
    vec4 getNoise( vec2 uv ) {
        vec2 uv0 = ( uv / 103.0 ) + vec2(uTime / 17.0, uTime / 29.0);
        vec2 uv1 = uv / 107.0-vec2( uTime / -19.0, uTime / 31.0 );
        vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( uTime / 101.0, uTime / 97.0 );
        vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( uTime / 109.0, uTime / -113.0 );
        vec4 noise =    texture2D( uWaveTexture, uv0 ) +
                        texture2D( uWaveTexture, uv1 ) +
                        texture2D( uWaveTexture, uv2 ) +
                        texture2D( uWaveTexture, uv3 );
        return noise * 0.5 - 1.0;
    }

    void sunLight(const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {
        vec3 sunDirection = normalize(uSunDirection);

        vec3 reflection = normalize(reflect(-sunDirection, surfaceNormal));
        float direction = max(0.0, dot(eyeDirection, reflection));
        
        specularColor += pow(direction, shiny)*uSunColor*spec;

        diffuseColor += max(dot(sunDirection, surfaceNormal),0.0)*uSunColor*diffuse;
    }

    void main() {
        vec4 noise = getNoise(vWorldPosition.xz * 100.0);
        vec3 surfaceNormal = normalize(noise.xzy * vec3(2.0, 1.0, 2.0));

        vec3 normal = normalize(vNormal.xzy) * 0.75 + surfaceNormal * 0.25;

        vec3 diffuseLight = vec3(0.0);
        vec3 specularLight = vec3(0.0);

        vec3 worldToEye = uCameraPosition-vWorldPosition.xyz;
        vec3 eyeDirection = normalize( worldToEye );
        sunLight( normal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );

        float distance = length(worldToEye);

        float distortionScale = 1.0;
        vec2 distortion = normal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;
        vec4 reflectionSample = texture2D( uMirrorTexture, vMirrorCoord.xy / vMirrorCoord.w + distortion );
        if(reflectionSample.a < 0.1) {
            gl_FragColor = vec4((diffuseLight + specularLight + vec3(0.1)) * uWaterColor, 1.0);
        }
        else {
            float theta = max( dot( eyeDirection, normal ), 0.0 );
            float rf0 = 0.3;
            float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );
            vec3 scatter = max( 0.0, dot( normal, eyeDirection ) ) * uWaterColor;
            vec3 albedo = mix( ( uSunColor * diffuseLight * 0.3 + scatter ), ( vec3( 0.1 ) + reflectionSample.rgb * 0.9 + reflectionSample.rgb * specularLight ), reflectance);
            vec3 outgoingLight = albedo;
            gl_FragColor = vec4( outgoingLight, 0.9 );
        }
    }
`;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true});
const controls = new OrbitControls( camera, renderer.domElement );

renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

const noiseRenderTarget = new THREE.WebGLRenderTarget(1024, 1024);
const mirrorRenderTarget = new THREE.WebGLRenderTarget(1024, 1024);

const uniforms = {
    uTime: { value: 0.0 },
    uNoiseTexture: { value: noiseRenderTarget.texture },
    uCameraPosition: { value: new THREE.Vector3(0, 0, 0) },
    uSunDirection: { value: new THREE.Vector3(0.70707, 0.15, 0.0) },
    uSunColor: { value: new THREE.Color(0xFEEDE6) },
    uWaterColor: { value: new THREE.Vector4(0x73 / 255, 0x83 / 255, 0xA0 / 255, 1.0) },
    uWaveHeight: { value: 5.0 },
    uWaveTexture: { value: new THREE.TextureLoader().load("resources/waternormals.jpg") },
    uMirrorTexture: { value: mirrorRenderTarget.texture },
    uMirrorTextureMatrix: { value: new THREE.Matrix4() },
};

uniforms.uWaveTexture.value.wrapS = uniforms.uWaveTexture.value.wrapT = THREE.RepeatWrapping;

const noiseMaterial = new THREE.RawShaderMaterial({
    uniforms, 
    vertexShader: noiseVertexShader,
    fragmentShader: noiseFragmentShader,
});

const noiseScene = new THREE.Scene();
const noisePlane = new THREE.PlaneGeometry(512, 512, 1, 1);
const noiseMesh = new THREE.Mesh(noisePlane, noiseMaterial);
noiseScene.add(noiseMesh);

const waterMaterial = new THREE.RawShaderMaterial({ 
    uniforms, 
    vertexShader: waterVertexShader, 
    fragmentShader: waterFragmentShader,
    wireframe: false,
    blending: THREE.NormalBlending,
    depthTest: true,
    transparent: true,
});

// Water plane
const planeGeometry = new THREE.PlaneGeometry(512, 512, 1000, 1000);
const planePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const waterPlane = new THREE.Mesh(planeGeometry, waterMaterial);
waterPlane.position.y = 0.02;
waterPlane.rotation.x = Math.PI + Math.PI / 2;
scene.add(waterPlane);

// Light
const ambientLight = new THREE.AmbientLight(0xD3BFCB, 2.0);
scene.add(ambientLight);
let sunLight = new THREE.DirectionalLight(0xFEEDE6, 5);
sunLight.position.set(uniforms.uSunDirection.value.x, uniforms.uSunDirection.value.y, uniforms.uSunDirection.value.z);
scene.add(sunLight);

// Boat
var boat = null;
const loader = new GLTFLoader();
loader.load("resources/scene.glb", function(gltf) {
    boat = gltf.scene.children[0];
    scene.add(boat);
}, undefined, function(error) {
    console.error(error);
});

// Skybox
// loader.load("resources/skybox.glb", function(gltf) {
//     gltf.scene.position.set(0, 0, 0);
//     gltf.scene.scale.set(0.01, 0.01, 0.01);
//     gltf.scene.rotation.y = 3.14;
//     scene.add(gltf.scene);
// }, undefined, function(error) {
//     console.error(error);
// });

let pixels = new Uint8Array(noiseRenderTarget.width * noiseRenderTarget.height * 4);

function getHeight(x, z) {
    return pixels[(z * noiseRenderTarget.width + x) * 4 + 3] / 255 * uniforms.uWaveHeight.value;
}

function getHeightPlane(planePoints) {
    let sum = 0;
    for(let i = 0; i < planePoints.length; i++) {
        sum += getHeight(planePoints[i].x, planePoints[i].z);
    }
    return sum / planePoints.length;
}

function getNormal(x, z) {
    let dx = getHeight(x + 1, z) - getHeight(x, z);
    let dy = getHeight(x, z + 1) - getHeight(x, z);
    return new THREE.Vector3(-dx, 2, dy).normalize();
}

function getNormalPlane(planePoints) {
    const v1 = planePoints[1].clone().sub(planePoints[0]);
    const v2 = planePoints[2].clone().sub(planePoints[0]);
    return v1.cross(v2).normalize();
}

// const lineGeometry = new THREE.BufferGeometry().setFromPoints( [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)] );
// const lineMaterial = new THREE.LineBasicMaterial( { color: 0x0000ff } );
// const line = new THREE.Line( lineGeometry, lineMaterial );
// scene.add( line );

// Debug sun
const sunGeomatry = new THREE.SphereGeometry(10.0, 32, 32);
const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
const sun = new THREE.Mesh(sunGeomatry, sunMaterial);
sun.position.set(uniforms.uSunDirection.value.x * 1000, uniforms.uSunDirection.value.y * 1000, uniforms.uSunDirection.value.z * 1000);
scene.add(sun);

function createMirrorCamera() {
    let mirrorWorldPosition = new THREE.Vector3(0, 0, 0).setFromMatrixPosition(waterPlane.matrixWorld);
    mirrorWorldPosition.y = boat.position.y;
    let cameraWorldPosition = new THREE.Vector3(0, 0, 0).setFromMatrixPosition(camera.matrixWorld);

    let rotationMatrix = new THREE.Matrix4().extractRotation(waterPlane.matrixWorld);

    let normal = new THREE.Vector3(0, 0, 1);
    normal.applyMatrix4(rotationMatrix);

    let view = new THREE.Vector3(0, 0, 0);
    view.subVectors( mirrorWorldPosition, cameraWorldPosition );

    if ( view.dot( normal ) > 0 ) 
        return null;

    view.reflect( normal ).negate();
    view.add( mirrorWorldPosition );

    rotationMatrix.extractRotation( camera.matrixWorld );

    let lookAtPosition = new THREE.Vector3(0, 0, -1);
    lookAtPosition.applyMatrix4( rotationMatrix );
    lookAtPosition.add( cameraWorldPosition );

    let target = new THREE.Vector3(0, 0, 0).subVectors( mirrorWorldPosition, lookAtPosition );
    target.reflect( normal ).negate();
    target.add( mirrorWorldPosition );

    let mirrorCamera = new THREE.PerspectiveCamera();
    mirrorCamera.position.copy( view );
    mirrorCamera.up.set( 0, 1, 0 );
    mirrorCamera.up.applyMatrix4( rotationMatrix );
    mirrorCamera.up.reflect( normal );
    mirrorCamera.lookAt( target );
    mirrorCamera.far = camera.far; // Used in WebGLBackground
    mirrorCamera.updateMatrixWorld();
    mirrorCamera.projectionMatrix.copy( camera.projectionMatrix );

    return mirrorCamera;
}

function animate() {
    if(boat != null) {
        renderer.setRenderTarget(noiseRenderTarget);
        renderer.render(noiseScene, camera, noiseRenderTarget);

        renderer.readRenderTargetPixels(noiseRenderTarget, 0, 0, noiseRenderTarget.width, noiseRenderTarget.height, pixels);
        let centerX = Math.round(noiseRenderTarget.width / 2);
        let centerZ = Math.round(noiseRenderTarget.height / 2);

        const boundingBox = new THREE.Box3();
        boundingBox.setFromObject(boat);
        let min = boundingBox.min;
        let max = boundingBox.max;

        const bottomPlanePoints = [
            new THREE.Vector3(min.x, min.y, min.z), // Bottom-left (min x, min z)
            new THREE.Vector3(min.x, min.y, max.z), // Bottom-back (min x, max z)
            new THREE.Vector3(max.x, min.y, min.z), // Bottom-right (max x, min z)
            new THREE.Vector3(max.x, min.y, max.z), // Bottom-front (max x, max z)
        ];

        // Project the points onto the water plane pixels
        for (let i = 0; i < bottomPlanePoints.length; i++) {
            bottomPlanePoints[i].multiplyScalar(noiseRenderTarget.width / planeGeometry.parameters.width).add(new THREE.Vector3(centerX, 0, centerZ));
        }

        // Round the points to the nearest pixel
        for(let i = 0; i < bottomPlanePoints.length; i++) {
            bottomPlanePoints[i].x = Math.round(bottomPlanePoints[i].x);
            bottomPlanePoints[i].z = Math.round(bottomPlanePoints[i].z);
        }

        // Find hight on texture
        for(let i = 0; i < bottomPlanePoints.length; i++) {
            bottomPlanePoints[i].y = getHeight(bottomPlanePoints[i].x, bottomPlanePoints[i].z) * 2; // lol magic number
        }

        let normal = getNormalPlane(bottomPlanePoints);
        normal.z *= -1;

        // The default "up" direction for the object is (0, 1, 0) in local space
        const up = new THREE.Vector3(0, 1, 0);

        // Create a quaternion that rotates from "up" to "normal"
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(up, normal);

        // Create a yaw rotation quaternion (90 degrees around the "up" axis)
        const yawAdjustment = new THREE.Quaternion();
        yawAdjustment.setFromAxisAngle(up, Math.PI / 2); // 90 degrees in radians

        quaternion.multiply(yawAdjustment);

        boat.quaternion.slerp(quaternion, 0.01);
        boat.position.lerp(new THREE.Vector3(0, getHeightPlane(bottomPlanePoints), 0), 0.1);
        // line.geometry.setFromPoints([new THREE.Vector3(0, getHeight(centerX, centerZ), 0), new THREE.Vector3(0, getHeight(centerX, centerZ), 0).add(new THREE.Vector3(normal.x * 20, normal.y * 20, normal.z * 20))]);

        uniforms.uTime.value += 0.01;
        uniforms.uWaveHeight.value = 5.0;
        uniforms.uCameraPosition.value = new THREE.Vector3(0, 0, 0).setFromMatrixPosition(camera.matrixWorld);;
        
        let mirrorCamera = createMirrorCamera();
        if(mirrorCamera != null) {
            uniforms.uMirrorTextureMatrix.value.set(
                0.5, 0.0, 0.0, 0.5,
                0.0, 0.5, 0.0, 0.5,
                0.0, 0.0, 0.5, 0.5,
                0.0, 0.0, 0.0, 1.0
            );
            uniforms.uMirrorTextureMatrix.value.multiply( mirrorCamera.projectionMatrix );
            uniforms.uMirrorTextureMatrix.value.multiply( mirrorCamera.matrixWorldInverse );

            renderer.setRenderTarget(mirrorRenderTarget);
            scene.remove(waterPlane);
            renderer.render(scene, mirrorCamera);
        }

        renderer.setRenderTarget(null);
        scene.add(waterPlane);
        renderer.render(scene, camera);

        // camera.position.set(-1.5784, 5.6844, 7.5588);
        // camera.rotation.set(-0.3786, -0.4076, -0.1564);
    }
} 

function resize() {
    var factor = 1; // percentage of the screen
    var w = window.innerWidth * factor;
    var h = window.innerHeight * factor;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}; 

window.addEventListener("resize", resize);


if(WebGL.isWebGL2Available()) {
	renderer.setAnimationLoop( animate );
} else {
	const warning = WebGL.getWebGL2ErrorMessage();
	document.getElementById('container').appendChild( warning );
}

