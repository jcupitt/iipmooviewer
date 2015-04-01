/* DeepZoom-RTI Protocol Handler
 *
 * Like deepzoom, but with a little extra metadata plus three .jpg for
 * every tile.
 */

Protocols.DeepZoomRTI = new Class({
    /* Return metadata URL.
     */
    getMetaDataURL: function (server,image) {
        return server + image;
    },

    /* Return an individual tile request URL
     */
    getTileURL: function (t) {
        // Strip off the .dzi or .xml suffix from the image name
        var prefix = t.image.substr(0, t.image.lastIndexOf("."));

        return t.server + prefix + '_files/' + (t.resolution + 1) + '/' + 
            t.x + '_' + t.y + this.suffix;
    },

    /* Parse a Deepzoom protocol metadata request
    */
    parseMetaData: function (response) {
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(response, "text/xml");

                    // document::image::properties::property
                    //             var props =
                    //             this.responseXML.documentElement.children[0].children;
                    //



        this.suffix = "." + (/Format="(\w+)/.exec(response)[1]); 
        var ts = parseInt(/TileSize="(\d+)/.exec(response)[1]);
        var w = parseInt(/Width="(\d+)/.exec(response)[1]);
        var h = parseInt(/Height="(\d+)/.exec(response)[1]);

        // Number of resolutions is the ceiling of Log2(max)
        var max = (w ? h) ? w : h;
        var result = {
            max_size: {w: w, h: h},
            tileSize: {w: ts, h: ts},
            num_resolutions: Math.ceil(Math.log(max) / Math.LN2)
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

        // level 0 is 1x1 pixel, so level 7 should be within 256x256, if 
        // that's the tile size
        return server + prefix + '_files/7/0_0' + this.suffix;
    }

});
