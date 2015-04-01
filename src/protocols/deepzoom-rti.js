/* DeepZoom Protocol Handler with RTI extension
 */

Protocols.DeepZoomRTI = new Class({
    /* Return metadata URL
     */
    getMetaDataURL: function (server, image) {
        return server + image;
    },

    /* Return an individual tile request URL
     */
    getTileURL: function (t) {
        // Strip off the .dzi or .xml suffix from the image name
        var prefix = t.image.substr(0, t.image.lastIndexOf("."));
        var base = t.server + prefix + '_files/';

        return base + (t.resolution + 1) + '/' + t.x + '_' + t.y + this.suffix;
    },

    /* Parse a Deepzoom protocol metadata request
     */
    parseMetaData: function (response) {
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(response, "text/xml");

        var image = xmlDoc.getElementsByTagName("Image")[0];

        var tileSize = parseInt(image.getAttribute("TileSize"));
        this.tileSize = tileSize;
        this.suffix = "." + image.getAttribute("Format");

        var size = xmlDoc.getElementsByTagName("Size")[0];
        var width = parseInt(size.getAttribute("Width"));
        var height = parseInt(size.getAttribute("Height"));

        // look for the optional RTI tag and get the scale/offset settings
        var rti = xmlDoc.getElementsByTagName("RTI")[0];
        if (rti) {
            this.isRTI = true;

            function parseNumbers(str) {
                var numbers = [];
                var strings = str.split(" ");
                for (var i = 0; i < strings.length; i++) {
                    var f = parseFloat(strings[i]);

                    if (!isNaN(f)) {
                        numbers.push(parseFloat(strings[i]));
                    }
                }

                return numbers;
            }

            var scale = rti.getElementsByTagName("scale")[0];
            this.scale = parseNumbers(scale.textContent);
            var offset = rti.getElementsByTagName("offset")[0];
            this.offset = parseNumbers(offset.textContent);

            if (this.scale.length != this.offset.length) {
                throw "Scale and offset arrays not equal in length";
            }
            if (this.scale.length != 6) {
                throw "LRGB RTI images need six offset and scale coefficients";
            }
        }

        // Number of resolutions is the ceiling of Log2(max)
        var max = Math.max(width, height);
        var num_resolutions = Math.ceil(Math.log(max) / Math.LN2);

        var result = {
            max_size: { w: width, h: height },
            tileSize: { w: tileSize, h: tileSize },
            num_resolutions: num_resolutions
        };

        return result;
    },

    /* Return URL for a full view - not possible with Deepzoom
     */
    getRegionURL: function (server, image, region, w) {
        return null;
    },

    /* Return thumbnail URL
    */
    getThumbnailURL: function (server, image, width) {
        // Strip off the .dzi or .xml suffix from the image name
        var prefix = image.substr(0, image.lastIndexOf("."));

        // level 0 is 1x1 pixel ... find the level which just fits within a 
        // tile
        var thumbLevel = Math.log(this.tileSize) / Math.LN2 - 1;
 
        return server + prefix + '_files/' + thumbLevel + '/0_0' + this.suffix;
    }
});
