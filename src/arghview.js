/* ArghView ... tiny webgl tiled image viewer. This is supposed to be able to
 * fit inside iipmooviewer.
 *
 * TODO:
 *
 * - add smooth zoom
 */

'use strict';

/* Make a new view oject.
 *
 * canvas: the thing we create the WebGL context on ... we fill this with 
 * pixels
 */
var ArghView = function (canvas) {
    this.canvas = canvas;
    canvas.arghView = this;

    // in debug mode, we draw some extra stuff, and also log a lot of messages
    this.debug = true;
    //this.debug = false;

    // set by setSource() below ... these come from iipmooviewer
    this.tileURL = null;
    this.maxSize = null;
    this.tileSize = null;
    this.numResolutions = null;

    // derived: the size of the current layer
    // equal to this.layerProperties[this.layer].width
    this.layerWidth = 0;
    this.layerHeight = 0;

    // the current time, in ticks ... use for cache ejection
    this.time = 0;

    // the size of the canvas we render into
    this.viewportWidth = canvas.clientWidth;
    this.viewportHeight = canvas.clientHeight;

    this.log("ArghView: viewportWidth = " + this.viewportWidth + 
        ", viewportHeight = " + this.viewportHeight);

    // the transformation from the layer (the current image layer we are
    // displaying) to the screen
    //
    // imagine starting with the tile whose top-left corner is at (0, 0) in the
    // current layer ... where do we draw this on the screen?
    //
    // step 1: translate 
    //
    // move up and left by this much ... ie. positive values will pan the
    // viewport across the image
    this.layerLeft = 0;
    this.layerTop = 0;

    // step 2: shrink the image
    //
    // simple scale of coordinates ... we usually reduce rather than enlarge, 
    // so this is a shrink factor
    //
    // scale = this.maxSize.w / this.layerProperties[this.layer].width;
    this.shrink = 1;

    // step 3: rotate the image
    //
    // we need to store the centre of rotation as well ... we want to be able 
    // to rotate about the centre of the screen, but we don't want our transform
    // to depend on the current xy of the viewport, because then when we tried
    // to pan we'd have a circular dependency (transform depends on the thing
    // we're trying to change)
    //
    // subtract rotateLeft/Top, rotate, add them back ... in other words,
    // rotateLeft/Top is in scaled and translated layer coordinates, not in
    // screen coordinates
    //
    // we support any angle, since we animate rotation changes, but this
    // will normally be 0, 90, 180, 270
    this.angle = 15.4;
    this.rotateLeft = 0;
    this.rotateTop = 0;

    // each +1 is a x2 layer larger
    this.layer = 0;

    // this gets populated once we know the tile source, see below
    this.layerProperties = []

    // all our tiles in a flat array ... use this for things like cache 
    // ejection
    this.tiles = []

    // index by layer, tile y, tile x
    this.cache = [];

    // max number of tiles we cache, set once we have a tile source
    this.maxTiles = 0;

    // default to 2D rendering
    this.RTI = false;

    // array of overlay lines to draw
    this.lines = [];

    this.initGL();
};

ArghView.prototype.constructor = ArghView;

ArghView.prototype.log = function (str, options) {
    var options = options || {};
    var level = options.level || 2;

    // higher numbers mean more important messages  
    var loggingLevel = 1;

    if (this.debug &&
        level >= loggingLevel) {
        console.log(str);
    }
}

/* Public ... transform from layer coordinates to screen coordinates, see above.
 */
ArghView.prototype.layer2screen = function (point) {
    var x = point[0];
    var y = point[1];

    x = x - this.rotateLeft;
    y = y - this.rotateTop;

    var angle = 2 * Math.PI * -this.angle / 360;
    var a = Math.cos(angle);
    var b = -Math.sin(angle);
    var c = -b;
    var d = a;

    var x2 = a * x + b * y;
    var y2 = c * x + d * y;

    x = x2 + this.rotateLeft;
    y = y2 + this.rotateTop;

    x -= this.layerLeft;
    y -= this.layerTop;

    x /= this.shrink;
    y /= this.shrink;

    return [x, y];
}

/* Public ... transform from screen coordinates to layer coordinates. See above.
 */
ArghView.prototype.screen2layer = function (point) {
    var x = point[0];
    var y = point[1];

    x *= this.shrink;
    y *= this.shrink;

    x += this.layerLeft;
    y += this.layerTop;

    x = x - this.rotateLeft;
    y = y - this.rotateTop;

    var angle = 2 * Math.PI * this.angle / 360;
    var a = Math.cos(angle);
    var b = -Math.sin(angle);
    var c = -b;
    var d = a;

    var x2 = a * x + b * y;
    var y2 = c * x + d * y;

    x = x2 + this.rotateLeft;
    y = y2 + this.rotateTop;

    return [x, y];
}

/* Public: transform a rect with a point transformer (eg. screen2layer).
 */
ArghView.prototype.transformRect = function (fn, rect) {
    // the diagional corners
    var p1 = fn([rect.x, rect.y]);
    var p2 = fn([rect.x + rect.w, rect.y + rect.h]);

    return {x: p1[0], y: p1[1], w: p2[0] - p1[0], h: p2[1] - p1[1]}; 
}

/* Public: normalise a rect, so width and/or height are always positive. 
 */
ArghView.prototype.normaliseRect = function (rect) {
    var x = rect.x;
    var y = rect.y;
    var w = rect.w;
    var h = rect.h;

    if (w < 0) {
        x += w;
        w *= -1;
    }
    if (h < 0) {
        y += h;
        h *= -1;
    }

    return {x: x, y: y, w: w, h: h}; 
}

ArghView.prototype.vertexShaderSourceLine = 
"    attribute vec2 aVertexPosition; " +
" " +
"    uniform mat4 uMVMatrix; " +
"    uniform mat4 uPMatrix; " +
" " +
"    void main(void) { " +
"        gl_Position = " +
"            uPMatrix * uMVMatrix * vec4(aVertexPosition, 0.0, 1.0); " +
"   }";

ArghView.prototype.fragmentShaderSourceLine = 
"    precision lowp float; " +
" " +
"    void main(void) { " +
"        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);" +
"    } ";

ArghView.prototype.vertexShaderSource = 
"    attribute vec2 aVertexPosition; " +
"    attribute vec2 aTextureCoord; " +
" " +
"    uniform mat4 uMVMatrix; " +
"    uniform mat4 uPMatrix; " +
" " +
"    varying lowp vec2 vTextureCoord; " +
" " +
"    void main(void) { " +
"        gl_Position = " +
"            uPMatrix * uMVMatrix * vec4(aVertexPosition, 0.0, 1.0); " +
"	     vTextureCoord = aTextureCoord; " +
"   }";

ArghView.prototype.fragmentShaderSource2D = 
"    precision lowp float; " +
" " +
"    varying lowp vec2 vTextureCoord; " +
" " +
"    uniform sampler2D uTileTexture; " +
" " +
"    void main(void) { " +
"        gl_FragColor = texture2D(uTileTexture,  " +
"           vec2(vTextureCoord.s, vTextureCoord.t)); " +
"    } ";

ArghView.prototype.fragmentShaderSourceRTI = 
"    precision lowp float; " +
" " +
"    varying lowp vec2 vTextureCoord; " +
" " +
"    uniform sampler2D uTileTexture; " +
"    uniform sampler2D uTileTextureH; " +
"    uniform sampler2D uTileTextureL; " +
" " +
"    uniform float solid; " +
" " +
"    uniform vec3 uHOffset; " +
"    uniform vec3 uHScale; " +
"    uniform vec3 uHWeight; " +
"    uniform vec3 uLOffset; " +
"    uniform vec3 uLScale; " +
"    uniform vec3 uLWeight; " +
" " +
"    void main(void) { " +
"        vec3 colour; " + 
" " +
"        if (solid != 0.0) { " +
"            colour = vec3(1.0, 1.0, 1.0); " +
"        } " +
"        else { " +
"           vec2 pos = vec2(vTextureCoord.s, vTextureCoord.t); " +
" " +
"           colour = texture2D(uTileTexture, pos).xyz; " +
"           vec3 coeffH = texture2D(uTileTextureH, pos).xyz; " +
"           vec3 coeffL = texture2D(uTileTextureL, pos).xyz; " +
" " +
"           vec3 l3 = (coeffH - uHOffset) * uHScale * uHWeight + " +
"                (coeffL - uLOffset) * uLScale * uLWeight; " +
"           float l = l3.x + l3.y + l3.z; " +
" " +
"           colour *= l; " +
"        } " +
" " +
"        gl_FragColor = vec4(colour, 1.0); " +
"    } ";

/* points is a 2D array eg. [[x1, y1], [x2, y2], ..], make a 
 * draw buffer.
 */
ArghView.prototype.bufferCreate = function (points) {
    var gl = this.gl;

    var vertex = [];
    for (var i = 0; i < points.length; i++) {
        vertex.push(points[i][0]);
        vertex.push(points[i][1]);
    }

    var vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertex), gl.STATIC_DRAW);
    vertexBuffer.itemSize = 2;
    vertexBuffer.numItems = points.length;

    return vertexBuffer;
}

/* Same, but make a buffer that will join pairs of points with discontinuous
 * lines.
 */
ArghView.prototype.bufferCreateDiscontinuous = function (points) {
    var gl = this.gl;

    if (points.length % 2 !== 0) {
        this.log("bufferCreateDiscontinuous: not an even number of points");
    }

    var vertex = [];
    var index = [];
    for (var i = 0; i < points.length; i++) {
        vertex.push(points[i][0]);
        vertex.push(points[i][1]);
        index.push(i);
    }

    var vertex_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertex), gl.STATIC_DRAW);
    vertex_buffer.itemSize = 2;
    vertex_buffer.numItems = points.length;

    var index_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index_buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(index), gl.STATIC_DRAW);
    index_buffer.itemSize = 1;
    index_buffer.numItems = points.length;

    return [vertex_buffer, index_buffer];
}

ArghView.prototype.mvPushMatrix = function () {
    var copy = mat4.create();
    mat4.set(this.mvMatrix, copy);
    this.mvMatrixStack.push(copy);
}

ArghView.prototype.mvPopMatrix = function () {
    if (this.mvMatrixStack.length === 0) {
        throw "Invalid popMatrix!";
    }
    this.mvMatrix = this.mvMatrixStack.pop();
}

ArghView.prototype.setMatrixUniforms = function () {
    this.gl.uniformMatrix4fv(this.program.pMatrixUniform, false, 
        this.pMatrix);
    this.gl.uniformMatrix4fv(this.program.mvMatrixUniform, false, 
        this.mvMatrix);
}

ArghView.prototype.initGL = function () {
    var gl;

    gl = WebGLUtils.setupWebGL(this.canvas);
    if (!gl) {
        return; 
    }
    this.gl = gl;

    function compileShader(type, source) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            alert(gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    }

    var vertexShader = 
        compileShader(gl.VERTEX_SHADER, this.vertexShaderSource);
    var vertexShaderLine = 
        compileShader(gl.VERTEX_SHADER, this.vertexShaderSourceLine);
    var fragmentShader2D = 
        compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource2D);
    var fragmentShaderLine = 
        compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSourceLine);
    var fragmentShaderRTI = 
        compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSourceRTI);

    function linkProgram(vertexShader, fragmentShader) {
        var program = gl.createProgram();

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            alert("Could not initialise shaders");
            return null;
        }

        program.vertexPositionAttribute = 
            gl.getAttribLocation(program, "aVertexPosition");
        program.textureCoordAttribute = 
            gl.getAttribLocation(program, "aTextureCoord");

        program.pMatrixUniform = gl.getUniformLocation(program, "uPMatrix");
        program.mvMatrixUniform = gl.getUniformLocation(program, "uMVMatrix");
        program.tileSizeUniform = gl.getUniformLocation(program, "uTileSize");
        program.tileTextureUniform = 
            gl.getUniformLocation(program, "uTileTexture");

        return program;
    }

    this.programLine = linkProgram(vertexShaderLine, fragmentShaderLine);
    this.program2D = linkProgram(vertexShader, fragmentShader2D);
    this.programRTI = linkProgram(vertexShader, fragmentShaderRTI);

    var program = this.programRTI;
    program.tileTextureHUniform = 
        gl.getUniformLocation(program, "uTileTextureH");
    program.tileTextureLUniform = 
        gl.getUniformLocation(program, "uTileTextureL");
    program.solidUniform = gl.getUniformLocation(program, "solid");
    program.hOffsetUniform = gl.getUniformLocation(program, "uHOffset");
    program.hScaleUniform = gl.getUniformLocation(program, "uHScale");
    program.hWeightUniform = gl.getUniformLocation(program, "uHWeight");
    program.lOffsetUniform = gl.getUniformLocation(program, "uLOffset");
    program.lScaleUniform = gl.getUniformLocation(program, "uLScale");
    program.lWeightUniform = gl.getUniformLocation(program, "uLWeight");

    this.pMatrix = mat4.create();
    this.mvMatrix = mat4.create();
    this.mvMatrixStack = [];

    this.hOffset = vec3.create()
    this.hScale = vec3.create()
    this.hWeight = vec3.create()
    this.lOffset = vec3.create()
    this.lScale = vec3.create()
    this.lWeight = vec3.create()

    // we draw tiles as 1x1 squares, scaled, translated and textured 
    this.vertexBuffer = this.bufferCreate([[1, 1], [1, 0], [0, 1], [0, 0]]);
    this.textureCoordsBuffer = this.vertexBuffer; 

    // draw overlay lines with this, scaled and rotated
    this.lineBuffer = this.bufferCreateDiscontinuous([[0, 0], [1, 0]]);

    // black background
    if (this.debug) {
        gl.clearColor(0.5, 0.0, 0.0, 1.0);
    }
    else {
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
    }
}

/* Public: set the source for image tiles ... parameters matched to 
 * iipmooview.
 *
 * tileURL: function (z, x, y){} ... makes a URL to fetch a tile from
 * maxSize: {w: .., h: ..} ... the dimensions of the largest layer, in pixels
 * tileSize: {w: .., h: ..} ... size of a tile, in pixels
 * numResolutions: int ... number of layers
 */
ArghView.prototype.setSource = function (tileURL, maxSize, 
        tileSize, numResolutions) {
    this.log("ArghView.setSource: ");

    this.tileURL = tileURL;
    this.maxSize = maxSize;
    this.tileSize = tileSize;
    this.numResolutions = numResolutions;

    // round n down to p boundary
    function roundDown(n, p) {
        return n - (n % p);
    }

    // round n up to p boundary
    function roundUp(n, p) {
        return roundDown(n + p - 1, p);
    }

    // need to calculate this from metadata ^^ above 
    this.layerProperties = []
    var width = maxSize.w;
    var height = maxSize.h;
    for (var i = numResolutions - 1; i >= 0; i--) {
        this.layerProperties[i] = {
            shrink: 1 << (numResolutions - i - 1),
            width: width,
            height: height,
            tilesAcross: (roundUp(width, tileSize.w) / tileSize.w) | 0,
            tilesDown: (roundUp(height, tileSize.h) / tileSize.h) | 0
        };
        width = (width / 2) | 0;
        height = (height / 2) | 0;
    }

    // max number of tiles we cache
    //
    // we want to keep gpu mem use down, so enough tiles that we can paint the
    // viewport three times over ... consider a 258x258 viewport with 256x256
    // tiles, we'd need up to 9 tiles to paint it once
    var tilesAcross = 1 + Math.ceil(this.viewportWidth / tileSize.w);
    var tilesDown = 1 + Math.ceil(this.viewportHeight / tileSize.h);
    this.maxTiles = 3 * tilesAcross * tilesDown; 

    // throw away any old state
    this.cache = [];
    this.tiles = [];

    // reset the layer stuff
    this.setLayer(1);
};

/* Public: turn on RTI rendering. We default to plain 2D rendering. 
 */
ArghView.prototype.setRTI = function (RTI) { 
    this.RTI = RTI;
}

/* Public: set the layer being displayed.
 */
ArghView.prototype.setLayer = function (layer) {
    this.log("ArghView.setLayer: " + layer);

    this.time += 1;

    layer = Math.max(layer, 0);
    layer = Math.min(layer, this.numResolutions - 1);
    this.layer = layer;
    this.layerWidth = this.layerProperties[this.layer].width;
    this.layerHeight = this.layerProperties[this.layer].height;

    this.log("  (layer set to " + layer + ")");
    this.log("  (layer size is " + 
            this.layerWidth + ", " + this.layerHeight + ")");
};

ArghView.prototype.getLayer = function () {
    return this.layer;
};

/* Map the current viewport to the layer. No moving to tile boundaries, we
 * sometimes need the real position for things like centring the view.
 */
ArghView.prototype.visibleLayerRect = function () {
    // get the bounding box of the viewport in the layer
    var screenRect = {x: 0, y: 0, 
        w: this.viewportWidth, h: this.viewportHeight};
    var layerRect = this.transformRect(this.screen2layer.bind(this), 
        screenRect);

    return this.normaliseRect(layerRect);
}

/* Public: set the transform-origin. We put the specified position, 
 * in layer coordinates, in the centre of the viewport.
 */
ArghView.prototype.setOrigin = function (x, y) {
    this.log("ArghView.setOrigin: x = " + x + ", y = " + y);

    this.time += 1;

    // this will be the centre for any rotation
    this.rotateLeft = x;
    this.rotateTop = y; 

    // position at (0, 0) then try transforming the new (x, y) ... the distance
    // that ends up from the centre of the screen is the value we need for
    // layerLeft/Top
    this.layerLeft = 0;
    this.layerTop = 0;

    var p = this.layer2screen([x, y]);

    var dx = p[0] - this.viewportWidth / 2;
    var dy = p[1] - this.viewportHeight / 2;

    this.layerLeft = dx;
    this.layerTop = dy;

    this.log("  (position set to " + this.layerLeft + 
            ", " + this.layerTop + ")");
};

/* Public ... light position in [-1, 1] ... compute the lighting function.
 */
ArghView.prototype.setLightPosition = function (x, y) {
    this.log("setLightPosition: x = " + x + ", y = " + y, {level: 1});

    var lx = Math.min(1.0, Math.max(-1.0, x * 1.1));
    var ly = Math.min(1.0, Math.max(-1.0, y * 1.1));

    var norm = Math.min(1.0, Math.sqrt(lx * lx + ly * ly));

    var alpha;
    if (lx !== 0.0) {
        alpha = Math.atan2(ly, lx);
    }
    else {
        alpha = Math.PI / 2;
    }
    alpha += 2 * Math.PI * this.angle / 360;

    var ix = norm * Math.cos(alpha);
    var iy = norm * Math.sin(alpha);

    this.hWeight[0] = ix * ix;
    this.hWeight[1] = iy * iy;
    this.hWeight[2] = ix * iy;
    this.lWeight[0] = ix;
    this.lWeight[1] = iy;
    this.lWeight[2] = 1.0;
}

/* Public ... set the scale and offset for the H and L images.
 */
ArghView.prototype.setScaleOffset = 
    function (hScale, hOffset, lScale, lOffset) {
    for (var i = 0; i < 3; i++) {
        this.hScale[i] = hScale[i];
        this.hOffset[i] = hOffset[i] / 255.0;
        this.lScale[i] = lScale[i];
        this.lOffset[i] = lOffset[i] / 255.0;
    }
}

/* Public ... set the overlay lines. An array of line objects, eg. 
 * argh.setLines([{x1: 100, y1: 100, x2: 500, y2: 200}]);
 */
ArghView.prototype.setLines = function (lines) {
    this.lines = lines;
}

/* Public ... set the rotation angle. In degrees, positive values are
 * anticlockwise. 
 */
ArghView.prototype.setAngle = function (angle) {
    this.angle = angle;
}

/* draw a tile at a certain tileSize ... tiles can be drawn very large if we 
 * are using a low-res tile as a placeholder while a high-res tile is being 
 * loaded
 */
ArghView.prototype.tileDraw = function (tile, tileSize) {
    var gl = this.gl;

    // position of tile in layer coordinates
    var x = tile.tileLeft * tileSize.w;
    var y = tile.tileTop * tileSize.h;

    // position on screen
    var p = this.layer2screen([x, y]);
    x = p[0];
    y = p[1];

    this.log("ArghView.tileDraw: " + tile.tileLayer + ", " +
        tile.tileLeft + ", " + tile.tileTop + " at pixel " +
        "x = " + x + ", y = " + y + 
        ", w = " + tileSize.w + ", h = " + tileSize.h, {level: 1});

    this.mvPushMatrix();

    mat4.translate(this.mvMatrix, [x, this.viewportHeight - y, 0]); 
    mat4.rotate(this.mvMatrix, 2 * Math.PI * this.angle / 360, [0, 0, 1]);
    mat4.translate(this.mvMatrix, [0, -tileSize.h, 0]); 
    mat4.scale(this.mvMatrix, [tileSize.w, tileSize.h, 1]);
    this.setMatrixUniforms();

    if (this.RTI) {
        gl.uniform1f(this.program.solidUniform, 0);
        gl.uniform3fv(this.program.hScaleUniform, this.hScale);
        gl.uniform3fv(this.program.hOffsetUniform, this.hOffset);
        gl.uniform3fv(this.program.hWeightUniform, this.hWeight);
        gl.uniform3fv(this.program.lScaleUniform, this.lScale);
        gl.uniform3fv(this.program.lOffsetUniform, this.lOffset);
        gl.uniform3fv(this.program.lWeightUniform, this.lWeight);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tile);
    gl.uniform1i(this.program.tileTextureUniform, 0);

    if (this.RTI) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tile.tileH);
        gl.uniform1i(this.program.tileTextureLUniform, 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, tile.tileL);
        gl.uniform1i(this.program.tileTextureHUniform, 2);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.textureCoordsBuffer);
    gl.enableVertexAttribArray(this.program.textureCoordAttribute);
    gl.vertexAttribPointer(this.program.textureCoordAttribute, 
        this.textureCoordsBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(this.program.vertexPositionAttribute);
    gl.vertexAttribPointer(this.program.vertexPositionAttribute, 
        this.vertexBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.vertexBuffer.numItems);

    if (this.debug) {
        gl.uniform1f(this.program.solidUniform, -1);
        gl.drawArrays(gl.LINE_LOOP, 0, this.vertexBuffer.numItems);
        mat4.scale(this.mvMatrix, [0.1, 0.1, 1]);
        this.setMatrixUniforms();
        gl.drawArrays(gl.LINE_LOOP, 0, this.vertexBuffer.numItems);
    }

    this.mvPopMatrix();
};

ArghView.prototype.lineDraw = function (line) {
    var gl = this.gl;

    this.log("ArghView.lineDraw: x1 = " + line.x1 + ", y1 = " + line.y1 + 
        ", x2 = " + line.x2 + ", y2 = " + line.y2)

    this.mvPushMatrix();

    // position on screen
    var p1 = this.layer2screen([line.x1, line.y1]);
    var x1 = p1[0];
    var y1 = this.viewportHeight - p1[1];
    var p2 = this.layer2screen([line.x2, line.y2]);
    var x2 = p2[0];
    var y2 = this.viewportHeight - p2[1];

    var dx = x2 - x1;
    var dy = y2 - y1;
    var length = Math.sqrt(dx * dx + dy * dy);
    var angle = Math.atan2(dy, dx);

    mat4.translate(this.mvMatrix, [x1, y1, 0]); 
    mat4.scale(this.mvMatrix, [length, length, 1]);
    mat4.rotate(this.mvMatrix, angle, [0, 0, 1]);
    this.setMatrixUniforms();

    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer[0]);
    gl.enableVertexAttribArray(this.program.vertexPositionAttribute);
    gl.vertexAttribPointer(this.program.vertexPositionAttribute,
        this.lineBuffer[0].itemSize, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lineBuffer[1]);
    gl.drawElements(gl.LINES,
        this.lineBuffer[1].numItems, gl.UNSIGNED_SHORT, 0);

    this.mvPopMatrix();
}

// get a tile from cache
ArghView.prototype.tileGet = function (z, x, y) {
    if (!this.cache[z]) {
        this.cache[z] = [];
    }
    var layer = this.cache[z];

    if (!layer[y]) {
        layer[y] = [];
    }
    var row = layer[y];

    var tile = row[x];

    if (tile) {
        tile.time = this.time;
    }

    return tile;
}

// add a tile to the cache
ArghView.prototype.tileAdd = function (tile) {
    if (!this.cache[tile.tileLayer]) {
        this.cache[tile.tileLayer] = [];
    }
    var layer = this.cache[tile.tileLayer];

    if (!layer[tile.tileTop]) {
        layer[tile.tileTop] = [];
    }
    var row = layer[tile.tileTop];

    if (row[tile.tileLeft]) {
        throw "tile overwritten!?!?!";
    }

    row[tile.tileLeft] = tile;
    tile.time = this.time;
    this.tiles.push(tile);
}

// delete the final tile in the tile list
ArghView.prototype.tilePop = function () {
    var tile = this.tiles.pop();
    this.log("ArghView.tilePop: " + tile.tileLayer + ", " + tile.tileLeft + 
            ", " + tile.tileTop);
    var layer = this.cache[tile.tileLayer];
    var row = layer[tile.tileTop];
    delete row[tile.tileLeft];
}

// if the cache has filled, trim it
//
// try to keep tiles in layer 0 and 1, and tiles in the current layer
ArghView.prototype.cacheTrim = function () {
    if (this.tiles.length > this.maxTiles) {
        var time = this.time;
        var layer = this.layer;

        var nTiles = this.tiles.length;
        for (var i = 0; i < nTiles; i++) {
            var tile = this.tiles[i];

            // calculate a "badness" score ... old tiles are bad, tiles 
            // outside the current layer are very bad, tiles in the top two 
            // layers are very good
            tile.badness = (time - tile.time) + 
                100 * Math.abs(layer - tile.tileLayer) -
                1000 * Math.max(0, 2 - tile.tileLayer);
        }

        // sort tiles most precious first
        this.tiles.sort(function (a, b) {
            return a.badness - b.badness;
        });

        this.log("ArghView.cacheTrim: after sort, tiles are:", {level: 1})
        this.log("  layer, left, top, age, badness", {level: 1})
        for (var i = 0; i < this.tiles.length; i++) {
            var tile = this.tiles[i];

            this.log("  " + tile.tileLayer + ", " + tile.tileLeft + ", " +
                tile.tileTop + ", " + (time - tile.time) + 
                ", " + tile.badness, {level: 1});
        }

        while (this.tiles.length > 0.8 * this.maxTiles) {
            this.tilePop();
        }
    }
};

ArghView.prototype.loadTexture = function (url) { 
    var gl = this.gl;

    this.log("ArghView.loadTexture: " + url);

    var tex = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    tex.readyToDraw = false;

    tex.url = url;

    var tileSize = this.tileSize;
    var img = new Image();
    img.src = url;
    img.onload = function () {
        // we may have overlaps, or edge tiles may be smaller than tilesize
        if (img.width !== tileSize.w || img.height !== tileSize.h) {
            var canvas = document.createElement("canvas");
            canvas.width = tileSize.w;
            canvas.height = tileSize.h;
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            img = canvas;
        }

        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, 
                gl.UNSIGNED_BYTE, img);

        tex.readyToDraw = true;

        if (tex.onload) {
            tex.onload();
        }
    };

    return tex;
}

// fetch a tile into cache 
ArghView.prototype.tileFetch = function (z, x, y) {
    var tileLeft = (x / this.tileSize.w) | 0;
    var tileTop = (y / this.tileSize.h) | 0;

    if (tileLeft < 0 ||
        tileTop < 0 ||
        tileLeft >= this.layerProperties[z].tilesAcross ||
        tileTop >= this.layerProperties[z].tilesDown) {
        return;
    }

    var tile = this.tileGet(z, tileLeft, tileTop);

    if (!tile) { 
        var url = this.tileURL(z, tileLeft, tileTop, 0); 
        var newTile = this.loadTexture(url); 
        newTile.view = this;
        newTile.tileLeft = tileLeft;
        newTile.tileTop = tileTop;
        newTile.tileLayer = z;

        if (this.RTI) {
            var url = this.tileURL(z, tileLeft, tileTop, 2); 
            newTile.tileH = this.loadTexture(url); 
            var url = this.tileURL(z, tileLeft, tileTop, 1); 
            newTile.tileL = this.loadTexture(url); 
        }

        newTile.isReady = function () {
            var ready = this.readyToDraw;
            if (this.view.RTI) {
                ready &= this.tileH.readyToDraw &&
                    this.tileL.readyToDraw;
            }

            return ready;
        }

        this.tileAdd(newTile);

        newTile.onload = function () {
            this.log("ArghView.tileFetch: arrival of " + 
                    newTile.tileLayer + ", " + newTile.tileLeft + 
                    ", " + newTile.tileTop, {level: 1});
            if (newTile.isReady) {
                newTile.view.draw();
            }
        }.bind(this);
        if (this.RTI) {
            newTile.tileH.onload = newTile.onload;
            newTile.tileL.onload = newTile.onload;
        }
    }
}

// scan the cache, drawing all visible tiles from layer 0 down to this layer
ArghView.prototype.draw = function () {
    this.log("ArghView.draw: viewportWidth = " + this.viewportWidth + 
            ", viewportHeight = " + this.viewportHeight, {level: 1});

    var gl = this.gl;

    this.time += 1;

    // have we resized since the last draw?
    var width = gl.canvas.clientWidth;
    var height = gl.canvas.clientHeight;
    if (gl.canvas.width !== width ||
        gl.canvas.height !== height) {
        gl.canvas.width = width;
        gl.canvas.height = height;
        this.viewportWidth = width;
        this.viewportHeight = height;
    }

    if (this.RTI) {
        this.program = this.programRTI;
        gl.useProgram(this.program);
    }
    else {
        this.program = this.program2D;
        gl.useProgram(this.program);
    }

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    mat4.ortho(0, this.viewportWidth, 0, this.viewportHeight, 0.1, 100, 
        this.pMatrix);
    mat4.identity(this.mvMatrix);
    mat4.translate(this.mvMatrix, [0, 0, -1]);

    var layerRect = this.visibleLayerRect();

    var n_drawn = 0;

    for (var z = 0; z <= this.layer; z++) { 
        // we draw tiles at this layer at 1:1, tiles above this we double 
        // tileSize each time
        var tileSize = {
            w: this.tileSize.w << (this.layer - z),
            h: this.tileSize.h << (this.layer - z)
        };

        // move left and up to tile boundary
        var left = ((layerRect.x / tileSize.w) | 0) * tileSize.w;
        var top = ((layerRect.y / tileSize.h) | 0) * tileSize.h;

        var right = layerRect.x + layerRect.w;
        var bottom = layerRect.y + layerRect.h;

        // clip against layer size
        left = Math.max(0, Math.min(this.layerWidth, left));
        right = Math.max(0, Math.min(this.layerWidth, right));
        top = Math.max(0, Math.min(this.layerHeight, top));
        bottom = Math.max(0, Math.min(this.layerHeight, bottom));

        for (var y = top; y < bottom; y += tileSize.h) { 
            for (var x = left; x < right; x += tileSize.w) { 
                var tileLeft = (x / tileSize.w) | 0;
                var tileTop = (y / tileSize.h) | 0;
                var tile = this.tileGet(z, tileLeft, tileTop);

                if (tile &&
                    tile.isReady()) { 
                    this.tileDraw(tile, tileSize);
                    n_drawn += 1;
                }
            }
        }
    }

    this.log("ArghView.draw: drew " + n_drawn + " tiles", {level: 1});

    // now draw any overlay lines
    if (this.lines.length > 0) {
        this.program = this.programLine;
        gl.useProgram(this.program);

        for (var i = 0; i < this.lines.length; i++) {
            this.lineDraw(this.lines[i]);
        }
    }
};

// fetch the tiles we need to display the current viewport, and draw it
ArghView.prototype.fetch = function () {
    this.log("ArghView.fetch", {level: 1});

    this.time += 1;
    this.cacheTrim();

    var layerRect = this.visibleLayerRect();

    // move left and up to tile boundary
    var left = ((layerRect.x / this.tileSize.w) | 0) * this.tileSize.w;
    var top = ((layerRect.y / this.tileSize.h) | 0) * this.tileSize.h;

    var right = layerRect.x + layerRect.w;
    var bottom = layerRect.y + layerRect.h;

    for (var y = top; y < bottom; y += this.tileSize.h) { 
        for (var x = left; x < right; x += this.tileSize.w) { 
            this.tileFetch(this.layer, x, y); 
        }
    }

    // we may have some already ... draw them
    this.draw();
};

