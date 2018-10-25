var H5P = H5P || {};
/**
 * Constructor.
 */
H5P.GeoQuiz = (function ($, JoubelUI) {
  function GeoQuiz(options) {
    if (!(this instanceof H5P.GeoQuiz)) {
      return new H5P.GeoQuiz(options);
    }
    this.options = options;
    this.userScore = 0;
    this.maxPointsPerQuestion = 1000;
    this.geoCountry = '';
    this.maxScore = this.maxPointsPerQuestion * this.options.questions.length;
    this.theMap = undefined;
    H5P.EventDispatcher.call(this);
    var self = this;
    this.on('resize', self.resize, self);
  }
  GeoQuiz.prototype = Object.create(H5P.EventDispatcher.prototype);
  GeoQuiz.prototype.constructor = GeoQuiz;
  
  /**
   * Append field to wrapper.
   *
   * @param {jQuery} $container
   */
  GeoQuiz.prototype.attach = function ($container) {
    var self = this;
    this.questionIndex = 0;
    this.defineMarkers();
    // Let's shuffle the questions
    this.options.questions = H5P.shuffleArray(this.options.questions);
    this.$container = $container.addClass('h5p-geoquiz');

    this.$overlayContainer = $('<div/>', {
      'id': 'h5p-geoquiz-main-content'
    }).appendTo($container);
    
    this.buildIntroductionPage(this.$overlayContainer);
    this.buildQuestionPage($container);
    this.buildAnswerPage($container);
    this.buildFeedbackPage($container);

    this.$mapContainer = $('<div/>', {
      'id': 'h5p-geoquiz-map-content'
    }).appendTo($container);

    this.theMap = $('<div>', {
      'class': 'h5p-geoquiz-map',
      'id': 'h5p-geoquiz-map',
      html: '&nbsp;'
    });

    this.$mapContainer.append(this.theMap);
    this.$container.append(this.$overlayContainer);
    this.$container.append(this.$mapContainer);
    this.loadMap();
  };

  /**
   * Build the introduction page container
   */
  GeoQuiz.prototype.buildIntroductionPage = function (container) {
    var self = this;
    var introContainer = $('<div/>', {
      'id': 'h5p-geoquiz-intro-container',
    }).appendTo(container);

    var introInnerContainer = $('<div/>', {
      'id': 'h5p-geoquiz-intro-inner-container',
      'class': 'inner',
    }).appendTo(introContainer);
    
    var intro = $('<div/>', {
      'id': 'h5p-geoquiz-intro',
      'class': 'child',
      html: this.options.intro
    }).appendTo(introInnerContainer);
    
    
    JoubelUI.createButton({
      'class': 'h5p-geoquiz-start',
      'id': 'h5p-geoquiz-start',
      'html': this.options.startBtnLabel,
    }).click(function () {
      $('#h5p-geoquiz-main-content').hide();
      $('#h5p-geoquiz-question-container').show();
      self.showQuestion();
    }).appendTo(intro);
  }

  /**
   * Build the question page container
   */
  GeoQuiz.prototype.buildQuestionPage = function (container) {
    this.$questionContainer = $('<div/>', {
      'id': 'h5p-geoquiz-question-container'
    }).appendTo(container).hide();

    var questionInnerContainer = $('<div/>', {
      'id': 'h5p-geoquiz-question-content',
      //'class': 'inner',
    }).appendTo(this.$questionContainer);
  }

  /**
   * Build the answer page container
   */
  GeoQuiz.prototype.buildAnswerPage = function (container) {
    var self = this;
    this.$answerContainer = $('<div/>', {
      'id': 'h5p-geoquiz-answer-container'
    }).appendTo(container).hide();
    
    var answerInnerContainer = $('<div/>', {
      'id': 'h5p-geoquiz-answer-inner-container',
      'class': 'inner',
    }).appendTo(this.$answerContainer);

    var answerContent = $('<div/>', {
      'id': 'h5p-geoquiz-answer-content',
      'class': 'child',
    }).appendTo(answerInnerContainer);

    this.scoreBar = new H5P.JoubelScoreBar(this.maxPointsPerQuestion);
    this.scoreBar.appendTo(answerContent);
    JoubelUI.createButton({
      'class': 'h5p-geoquiz-next child',
      'id': 'h5p-geoquiz-next',
      'html': this.options.nextBtnLabel,
    }).click(function () {
      self.questionIndex++;
      $('#h5p-geoquiz-answer-container').hide();
      self.showQuestion();
    }).appendTo(answerContent);
    
    // Add retry button, if enabled
    if(this.options.behaviour.enableSolutionsButton === true) {
      JoubelUI.createButton({
        'class': 'h5p-geoquiz-show-solution child',
        'id': 'h5p-geoquiz-show-solution',
        'html': this.options.showSolutionsBtnLabel,
      }).click(function () {
        self.showQuestionSolution();
      }).appendTo(answerContent);
    }      
  }

  /**
   * Build the feedback page container
   */
  GeoQuiz.prototype.buildFeedbackPage = function (container) {
    var self = this;
    this.$feedbackContainer = $('<div/>', {
      'id': 'h5p-geoquiz-feedback-container'
    }).appendTo(container).hide();
    var feedbackInnerContainer = $('<div/>', {
      'id': 'h5p-geoquiz-feedback-inner-container',
      'class': 'inner',
    }).appendTo(this.$feedbackContainer);
    var feedbackContent = $('<div/>', {
      'id': 'h5p-geoquiz-feedback-content',
      'class': 'child',
    }).appendTo(feedbackInnerContainer);
    var feedbackMessage = $('<p/>', {
      'id': 'h5p-geoquiz-feedback-content-message',
    }).appendTo(feedbackContent);
    // Add retry button, if enabled
    if(this.options.behaviour.enableRetry === true) {
      this.$retryButton = JoubelUI.createButton({
        'class': 'h5p-results-retry-button h5p-invisible h5p-button',
        'html': this.options.retryBtnLabel
      }).click(function () {
        self.resetTask();
      }).appendTo(feedbackContent);
    }
  }
  
  /**
   * Show the actual question from question set
   */
  GeoQuiz.prototype.showQuestion = function () {
    var self = this;
    // Reset stored informations
    self.scoreBar.setScore(0);
    self.geoCountry = '';
    if (self.$userMarker !== undefined) {
      self.map.removeLayer(self.$userMarker);
      self.$userMarker = undefined;
    }
    if (self.$answerMarker !== undefined) {
      self.map.removeLayer(self.$answerMarker);
      self.$answerMarker = undefined;
    }
    if (self.drawnItems !== undefined) {
      self.map.removeLayer(self.drawnItems);
      self.drawnItems = undefined;
    }
    // Check if we are at the end of the quiz or we have other questions
    if (self.questionIndex > (self.options.questions.length - 1) ) {
      // No questions left, add overall feedback using "You got @score of @total points"
      var scoreText = self.options.overallFeedback.replace('@score', self.userScore).replace('@total', self.maxScore);
      $('#h5p-geoquiz-feedback-content-message').html( scoreText );
      $('#h5p-geoquiz-feedback-container').show();
      self.triggerXAPIScored(self.userScore, self.maxScore, "done", true, true);
      // Show/Hide retry button, if enabled
      if(self.options.behaviour.enableRetry === true) {
        if (self.userScore < self.maxScore) {
          self.$retryButton.removeClass('h5p-invisible');
        } else {
          self.$retryButton.addClass('h5p-invisible');
        }
      }
    } else {
      // Show next question
      $('#h5p-geoquiz-question-content').text(self.options.questions[self.questionIndex].text);
      $('#h5p-geoquiz-question-container').show();
    }
  };

  /**
   * Restart quiz
   */
  GeoQuiz.prototype.resetTask = function () {
    var self = this;
    self.questionIndex = 0;
    self.userScore = 0;
    self.options.questions = H5P.shuffleArray(self.options.questions);
    $('#h5p-geoquiz-feedback-container').hide();
    self.showQuestion();
  }

  /**
   * Show solution for actual question
   */
  GeoQuiz.prototype.showQuestionSolution = function () {
    var self = this;
    if (self.$answerMarker !== undefined) {
      self.$answerMarker.addTo(self.map);
    }
    if (self.drawnItems !== undefined) {
      self.map.addLayer(self.drawnItems);
    }
  }

  /**
   * Add a marker into leaflet map on click event
   * Calculates points for given answer
   *
   * @param {Event} event
   */  
   // Leaflet's default projection is EPSG:3857, also known as "Google Mercator" or "Web Mercator"
  GeoQuiz.prototype.addMarker = function (event) {
    var self = this;
    var points = 0;
    var question = self.geoquiz.options.questions[self.geoquiz.questionIndex];
    self.geoquiz.$userMarker = L.marker(event.latlng, { draggable: false });
    if (question.locationType === 'location') {
      var latlng = self.geoquiz.coordSplit(question.typeLocation);
      // Store right answer as a leaflet marker
      self.geoquiz.$answerMarker = L.marker(latlng, { draggable: false });
      /*if (self.geoquiz.options.behaviour.enableSolutionsButton === true) {
        self.geoquiz.$answerMarker.addTo(self.geoquiz.map);
      }*/
      var distance = parseInt(latlng.distanceTo(event.latlng) / 1000);
      points = (self.geoquiz.maxPointsPerQuestion - distance);
      if (points < 0) {
        points = 0;
      }
      // Store user answer as a leaflet marker
      var answerIcon = self.geoquiz.whichMarker(points);
      self.geoquiz.$userMarker = L.marker(event.latlng, { draggable: false, icon: answerIcon }).addTo(self.geoquiz.map);
      self.geoquiz.updateScore(points);
    } else if (question.locationType === 'area') {
      var area = self.geoquiz.options.questions[self.geoquiz.questionIndex].typeArea;
      self.geoquiz.isMarkerInsideArea(area, self.geoquiz.$userMarker).then(function (response) {
        if (self.geoquiz.userCountry === self.geoquiz.geoCountry) {
          points = parseInt(self.geoquiz.maxPointsPerQuestion);
        }
        // Store user answer as a leaflet marker
        var answerIcon = self.geoquiz.whichMarker(points);
        self.geoquiz.$userMarker = L.marker(event.latlng, { draggable: false, icon: answerIcon }).addTo(self.geoquiz.map);
        self.geoquiz.updateScore(points);
      });
    }
  };

  /**
   * Check if the user marker is within the given area polygon
   *
   * @param {String} area name to load
   * @param {L.marker} marker
   */  
   GeoQuiz.prototype.isMarkerInsideArea = function (area, marker) {
    var self = this;
    return new Promise(function(resolve, reject) {
      self.loadArea( area ).then(function(loadAreaResponse) {
        self.getNominatimCountry(marker).then(function (getNominatimCountryResponse) {
          resolve("isMarkerInsideArea worked!");
        });
      });
    });
  }

  /**
   * Load geoJSON encoded country multipolygon
   *
   * @param {String} area name to load
   */  
  GeoQuiz.prototype.loadArea = function (area) {
    var self = this;
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        self.geoCountry = '';
        $.getJSON( self.getLibraryFilePath('') + "geojson-data/" + area + ".geo.json")
          .done(function( json ) {
            self.drawnItems = new L.FeatureGroup();
            var geojsonLayer = L.geoJson(json);
            geojsonLayer.eachLayer(
              function(l){
                self.geoCountry = l.feature.properties.name;
                self.drawnItems.addLayer(l);
              }
            );
            /*if (self.options.behaviour.enableSolutionsButton === true) {
              self.map.addLayer(self.drawnItems);
            }*/
            resolve("loadArea worked!");
          })
          .fail(function( jqxhr, textStatus, error ) {
            var err = textStatus + ", " + error;
            console.log( "Request Failed: " + err );
            reject(Error("loadArea broke"));
          });
      }, 10);
    });
  }

  /**
   * Get country of marker by asking nominatim.openstreetmap.org
   *
   * @param {L.marker} marker
   */  
  GeoQuiz.prototype.getNominatimCountry = function (marker) {
    var self = this;
    var x = marker.getLatLng().lat, y = marker.getLatLng().lng;
    self.userCountry = 'Unknow';
    return new Promise(function(resolve, reject) {
      // Force language to en to match geojson naming
      var url = "https://nominatim.openstreetmap.org/search?q="+x+","+y+"&format=json&addressdetails=1&accept-language=en";
      $.getJSON( url )
          .done(function( data ) {
            var queryCountry = '';
            $.each( data, function( key, val ) {
              self.userCountry = val.address.country;
            });
            resolve("getNominatimCountry worked!");
            //
          })
          .fail(function( jqxhr, textStatus, error ) {
            var err = textStatus + ", " + error;
            console.log( "Request Failed: " + err );
            reject(Error("getNominatimCountry broke"));
          });

    });
  }

  /**
   * Update score and show score bar
   *
   * @param {number} score
   */
  GeoQuiz.prototype.updateScore = function (points) {
    this.userScore += points;
    this.scoreBar.setScore(points);
    $('#h5p-geoquiz-question-container').hide();
    $('#h5p-geoquiz-answer-container').css({'opacity':0}).show();
    $('#h5p-geoquiz-answer-container').animate({'opacity':1}, 800);
  }
  

  GeoQuiz.prototype.setContainerHeight = function() {
    var containerWidth = $('.h5p-geoquiz').width();
    var offset = parseInt($('.h5p-actions').height());
    var containerHeight = parseInt(Math.round(containerWidth / 21 * 9)) - offset;
    $('#h5p-geoquiz-map').height(containerHeight);
    $('#h5p-geoquiz-intro-container').height(containerHeight);
    $('#h5p-geoquiz-feedback-container').height(containerHeight);
    $('#h5p-geoquiz-answer-container').height(containerHeight);
    return containerHeight;
  };  

  
  /**
   * Update the dimensions of the task when resizing the task.
   */
  GeoQuiz.prototype.resize = function () {
    var self = this;
    self.setContainerHeight();
    setTimeout(function () {
      if (H5P.isFramed === true) {
        var checkHeight = setInterval(function(){
          var frameId = 'h5p-iframe-' + H5P.instances[0].contentId;
          var containerHeight = parseInt($('.h5p-geoquiz').height()) + parseInt($('.h5p-actions').height());
          var frameHeight = window.parent.jQuery('#' + frameId).height();
          if(containerHeight !== frameHeight) {
            window.parent.jQuery('#' + frameId).height(containerHeight);
          } else {
            clearInterval(checkHeight);
          }
        }, 10);
      }
    }, 10);
  };  

  GeoQuiz.prototype.coordSplit = function (text) {
    var res = text.split(",");
    return L.latLng(res[0], res[1]);
  }
  
  /**
   * Load the choosed map from settings
   */
  GeoQuiz.prototype.loadMap = function () {
    var self = this;
    setTimeout(function(){
      self.map = L.map('h5p-geoquiz-map', { zoomControl:false });
      var latlng = self.coordSplit(self.options.mapCenter);
      self.map.setView(latlng, self.options.mapZoom);
      self.map.on('click', self.addMarker, {geoquiz: self});    

      switch (self.options.mapType) {
        case 'CartoDB.VoyagerNoLabels':
          var VoyagerNoLabels = L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
            subdomains: 'abcd',
            maxZoom: 19
          });
          self.map.addLayer(VoyagerNoLabels);
          break;
        case 'Hydda.Base':
          var Hydda_Base = L.tileLayer('https://{s}.tile.openstreetmap.se/hydda/base/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: 'Tiles courtesy of <a href="http://openstreetmap.se/" target="_blank">OpenStreetMap Sweden</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          });
          self.map.addLayer(Hydda_Base);
          break;
        case 'Stamen.Watercolor':
          var Stamen_Watercolor = L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.{ext}', {
            attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            subdomains: 'abcd',
            minZoom: 1,
            maxZoom: 16,
            ext: 'png'
          });
          self.map.addLayer(Stamen_Watercolor);
          break;
        case 'Stamen.TerrainBackground':
          var Stamen_TerrainBackground = L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain-background/{z}/{x}/{y}{r}.{ext}', {
            attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            subdomains: 'abcd',
            minZoom: 0,
            maxZoom: 18,
            ext: 'png'
          });
          self.map.addLayer(Stamen_TerrainBackground);
          break;
        case 'Esri.WorldImagery':
          var Esri_WorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
          });
          self.map.addLayer(Esri_WorldImagery);
          break;
        default:
          break;
      }
    }, 200);
  };

  /**
   * Get marker icon by points reached
   */
  GeoQuiz.prototype.whichMarker = function (points) {
    var percent = parseInt((points / this.maxPointsPerQuestion) * 100);
    if (percent <= 25) {
      return this.redIcon;
    } else if (percent <= 50) {
      return this.orangeIcon;
    } else if (percent <= 75) {
      return this.yellowIcon;
    } else if (percent > 75) {
      return this.greenIcon;
    }
  }

  /**
   * Define markers icon for user answer
   */
  GeoQuiz.prototype.defineMarkers = function () {
    // Create the answer marker icons
    var imgPath = this.getLibraryFilePath('') + 'css/images/';
    // more then 75%
    this.greenIcon = new L.Icon({
      iconUrl: imgPath + 'marker-icon-2x-green.png',
      shadowUrl: imgPath + 'marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
    // less then 75%
    this.yellowIcon = new L.Icon({
      iconUrl: imgPath + 'marker-icon-2x-yellow.png',
      shadowUrl: imgPath + 'marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
    // less then 50%
    this.orangeIcon = new L.Icon({
      iconUrl: imgPath + 'marker-icon-2x-orange.png',
      shadowUrl: imgPath + 'marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
    // less then 25%
    this.redIcon = new L.Icon({
      iconUrl: imgPath + 'marker-icon-2x-red.png',
      shadowUrl: imgPath + 'marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
  }

  return GeoQuiz;
})(H5P.jQuery, H5P.JoubelUI);