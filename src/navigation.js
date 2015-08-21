/* IIPMooViewer Navigation Widget

   Copyright (c) 2007-2014 Ruven Pillay <ruven@users.sourceforge.net>
   IIPImage: http://iipimage.sourceforge.net

   --------------------------------------------------------------------
   This program is free software; you can redistribute it and/or modify
   it under the terms of the GNU General Public License as published by
   the Free Software Foundation; either version 3 of the License, or
   (at your option) any later version.

   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.
   --------------------------------------------------------------------
*/


var Navigation = new Class({

  Extends: Events,

  options: {},         // Options
  position: {x:0,y:0}, // Position of navigation window
  size: {x:0,y:0},     // Size of navigation window  


  /* Constructor
   */
  initialize: function( options ){
    this.options.showNavWindow = (options.showNavWindow == false) ? false : true;
    this.options.showNavButtons = (options.showNavButtons == false) ? false : true;
    this.options.navWinSize = options.navWinSize || 0.2;
    this.options.showCoords = (options.showCoords == true) ? true : false;
    this.prefix = options.prefix;
    this.onToolChange = options.onToolChange;
    this.standalone = (options.navigation&&options.navigation.id&&document.id(options.navigation.id)) ? true : false;
    this.options.navButtons = (options.navigation&&options.navigation.buttons) || ['reset','zoomIn','zoomOut'];
    this.options.toolButtons = (options.navigation&&options.navigation.tools) || [];
  },


  /* Create our navigation widget
   */
  create: function( container ){

    // If the user does not want a navigation window, do not create one!
    if( (!this.options.showNavWindow) && (!this.options.showNavButtons) ) return;

    this.navcontainer = new Element( 'div',{
      'class': 'navcontainer',
      'styles': {
        width: this.size.x,
        position: (this.standalone) ? 'static' : 'absolute' }
    });

    if(!this.standalone) {
      var toolbar = new Element( 'div', {
        'class': 'toolbar',
        'events': {
           dblclick: function(source){
             source.getElement('div.navbuttons').get('slide').toggle();
           }.pass(container)
        }
      });
      toolbar.store( 'tip:text', IIPMooViewer.lang.drag );
      toolbar.inject(this.navcontainer);
    }  


    // Create our navigation div and inject it inside our frame if requested
    if( this.options.showNavWindow ){

      var navwin = new Element( 'div', {
        'class': 'navwin',
        'styles': { height: this.size.y }
      });
      navwin.inject( this.navcontainer );


      // Create our navigation image and inject inside the div we just created
      var navimage = new Element( 'img', {
        'class': 'navimage',
        'events': {
          'click': this.scroll.bind(this),
          'mousewheel:throttle(75)': function(e){ _this.fireEvent('zoom',e); },
          // Prevent user from dragging navigation image
          'mousedown': function(e){ var event = new DOMEvent(e); event.stop(); }
        }
      });
      navimage.inject(navwin);

      navimage.addEvent('mousedown', function (e) { e.stop(); });


      // Create our navigation zone and inject inside the navigation div
      this.zone = new Element( 'div', {
        'class': 'zone',
        'morph': {
          duration: 500,
          transition: Fx.Transitions.Quad.easeInOut
        },
        'events': {
          'mousewheel:throttle(75)': function(e){ _this.fireEvent('zoom',e); },
          'dblclick': function(e){ _this.fireEvent('zoom',e); }
        },
        'styles': {
          width: 0, height: 0
        }
      });
      this.zone.inject(navwin);

      this.zone.addEvent('mousedown', function (e) { e.stop(); });

      if( this.options.showCoords ){
        // Create our coordinates viewer
        this.coords = new Element('div', {
          'class': 'coords',
          'html': '<div></div>',
          'styles': {
            top: this.size.y - 6,
            opacity: 0.8
           },
           'tween': {
             duration: 1000,
             transition: Fx.Transitions.Sine.easeOut,
             link: 'cancel'
           }
        });
        this.coords.inject(this.navcontainer);
      }
    }


    // Create our nav buttons if requested
    if( this.options.showNavButtons ){

      var navbuttons = new Element('div', {
        'class': 'navbuttons'
      });

      // Create our buttons as SVG with fallback to PNG
      var prefix = this.prefix;
      this.options.navButtons.each( function(k){
        new Element('img',{
          'src': prefix + k + (Browser.buggy?'.png':'.svg'),
          'class': k,
          'events':{
            'error': function(){
              this.removeEvents('error'); // Prevent infinite reloading
              this.src = this.src.replace('.svg','.png'); // PNG fallback
            }
          }
        }).inject(navbuttons);
      });
      navbuttons.inject(this.navcontainer);

      // Need to set this after injection
      navbuttons.set('slide', {duration: 300, transition: Fx.Transitions.Quad.easeInOut, mode:'vertical'});

      var _this = this;

      // Add events to our buttons
      if(this.options.navButtons.contains('reset')) navbuttons.getElement('img.reset').addEvent( 'click', function(){ _this.fireEvent('reload'); });
      if(this.options.navButtons.contains('zoomIn')) navbuttons.getElement('img.zoomIn').addEvent( 'click', function(){ _this.fireEvent('zoomIn'); });
      if(this.options.navButtons.contains('zoomOut')) navbuttons.getElement('img.zoomOut').addEvent( 'click', function(){ _this.fireEvent('zoomOut'); }); 
      if(this.options.navButtons.contains('rotateLeft')) navbuttons.getElement('img.rotateLeft').addEvent( 'click', function(){ _this.fireEvent('rotate',-90); });
      if(this.options.navButtons.contains('rotateRight')) navbuttons.getElement('img.rotateRight').addEvent( 'click', function(){ _this.fireEvent('rotate',90); });
      if(this.options.navButtons.contains('addAnnotation')) navbuttons.getElement('img.addAnnotation').addEvent( 'click', function(){ _this.fireEvent('addAnnotation'); });

      // we want to stop mousedown on the buttons reaching our parent .. it can 
      // trigger actions like light movement
      navbuttons.addEvent('mousedown', function (e) { e.stop(); });
    }

    // add our set of tool buttons ... only one can be active, the name of
    // the active tool (if any) is set on navigation.currentTool
    if (this.options.toolButtons) {
        var toolbuttons = new Element('div', {
            class: 'toolbuttons'
        });

        this.currentTool = null;
        toolbuttons.currentTool = null;

        this.options.toolButtons.each(function (name) {
            var element = new Element('img', {
                class: name,
                events: {
                    error: function () {
                        // Prevent infinite reloading
                        this.removeEvents('error'); 
                        // PNG fallback
                        this.src = this.src.replace('.svg','.png'); 
                    },
                    click: function() {
                        this.setTool(!this.on); 
                    }
                }
                });

            element.name = name;
            element.toolbar = toolbuttons;
            element.navigation = _this;
            element.setTool = function (on) {
                this.on = on;
                this.src = this.navigation.prefix + this.name + 
                    (this.on ? 'On' : 'Off') + 
                    (Browser.buggy?'.png':'.svg');

                if (on) {
                    if (this.toolbar.currentTool) {
                        this.toolbar.currentTool.setTool(false);
                    }

                    this.toolbar.currentTool = this;
                    if (this.navigation.onToolChange) {
                        this.navigation.onToolChange(this.name);
                    }
                }
                else if (this.toolbar.currentTool === this) {
                    this.toolbar.currentTool = null;
                    if (this.navigation.onToolChange) {
                        this.navigation.onToolChange(null);
                    }
                }
            };

            element.setTool(false);

            element.inject(toolbuttons);
            });

        toolbuttons.inject(navbuttons);

        // Have to set this after injection
        toolbuttons.set('slide', {
            duration: 300, 
            transition: Fx.Transitions.Quad.easeInOut, 
            mode: 'vertical'
        });
    }

    // Inject our navigation container into our holding div
    this.navcontainer.inject(container);


    if( this.options.showNavWindow ){
      this.zone.makeDraggable({
        container: this.navcontainer.getElement('div.navwin'),
        // Take a note of the starting coords of our drag zone
        onStart: function() {
          var pos = _this.zone.getPosition();
          _this.position = {x: pos.x, y: pos.y-10};
          _this.zone.get('morph').cancel();
        },
        onComplete: this.scroll.bind(this)
      });
    }

    if(!this.standalone) this.navcontainer.makeDraggable( {container:container, handle:toolbar} );

  },


  /* Toggle the visibility of our navigation window
   */
  toggleWindow: function(){
    // For removing the navigation window if it exists - must use the get('reveal')
    // otherwise we do not have the Mootools extended object
    if( this.navcontainer ){
      this.navcontainer.get('reveal').toggle();
    }
  },


  /* Reflow our navigation window
   */
  reflow: function( container ){

    // Resize our navigation window
    container.getElements('div.navcontainer, div.navcontainer div.loadBarContainer').setStyle('width', this.size.x);

    // And reposition the navigation window
    if( this.options.showNavWindow ){
      if( this.navcontainer ) this.navcontainer.setStyle( 'left', container.getPosition(container).x + container.getSize().x - this.size.x - 10 );

      // Resize our navigation window div
      if(this.zone) this.zone.getParent().setStyle('height', this.size.y );

      if( this.options.showCoords ) this.coords.setStyle( 'top', this.size.y-6 );
    }

  },


  /* Set the source image
   */
  setImage: function( src ){
    if( this.navcontainer && this.navcontainer.getElement('img.navimage') ){
      this.navcontainer.getElement('img.navimage').src = src;
    }
  },


  /* Update screen coordinates
   */
  setCoords: function( text ){
    if( !this.coords ) return;
    this.coords.getElement('div').set( 'html', text );
  },


  /* Handle click or drag scroll events
   */
  scroll: function(e){

    // Cancel any running morphs on zone
    this.zone.get('morph').cancel();

    var xmove = 0;
    var ymove = 0;

    var zone_size = this.zone.getSize();
    var zone_w = zone_size.x;
    var zone_h = zone_size.y;

    // From a mouse click
    if( e.event ){
      e.stop();
      var pos = this.zone.getParent().getPosition();
      xmove = e.page.x - pos.x - Math.floor(zone_w/2);
      ymove = e.page.y - pos.y - Math.floor(zone_h/2);
    }
    else{
      // From a drag
      xmove = e.offsetLeft;
      ymove = e.offsetTop-10;
      if( (Math.abs(xmove-this.position.x) < 3) && (Math.abs(ymove-this.position.y) < 3) ) return;
    }

    if( xmove > (this.size.x - zone_w) ) xmove = this.size.x - zone_w;
    if( ymove > (this.size.y - zone_h) ) ymove = this.size.y - zone_h;
    if( xmove < 0 ) xmove = 0;
    if( ymove < 0 ) ymove = 0;

    xmove = xmove/this.size.x
    ymove = ymove/this.size.y

    // Fire scroll event
    this.fireEvent( 'scroll', {x:xmove,y:ymove} );

    // Position the zone after a click, but not for zone drags
    if( e.event ) this.update( xmove, ymove, zone_w/this.size.x, zone_h/this.size.y );

  },


  /* Reposition the navigation rectangle on the overview image
   */
  update: function(x,y,w,h){

    if( !this.options.showNavWindow ) return;

    var pleft = x * (this.size.x);
    if( pleft > this.size.x ) pleft = this.size.x;
    if( pleft < 0 ) pleft = 0;

    var ptop = y * (this.size.y);
    if( ptop > this.size.y ) ptop = this.size.y;
    if( ptop < 0 ) ptop = 0;

    var width = w * (this.size.x);
    if( pleft+width > this.size.x ) width = this.size.x - pleft;

    var height = h * (this.size.y);
    if( height+ptop > this.size.y ) height = this.size.y - ptop;

    var border = this.zone.offsetHeight - this.zone.clientHeight;

    // Move the zone to the new size and position
    this.zone.morph({
      fps: 30,
      left: pleft,
      top: (this.standalone) ? ptop : ptop + 8, // 8 is the height of toolbar
      width: (width-border>0)? width - border : 1, // Watch out for zero sizes!
      height: (height-border>0)? height - border : 1
    });

  }

});
