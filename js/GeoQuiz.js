var H5P = H5P || {};

H5P.GeoQuiz = (function ($, JoubelUI, Question) {
  /**
   * @constructor
   * @extends Question
   * @param {object} options Options for geoquiz
   * @param {string} contentId H5P instance id
   * @param {Object} contentData H5P instance data
   */
   function GeoQuiz(options, contentId, contentData) {
    if (!(this instanceof H5P.GeoQuiz)) {
      return new H5P.GeoQuiz(options, contentId, contentData);
    }
    this.contentId = contentId;
    Question.call(this, 'geoquiz');

    /**
     * Keeps track of settings
     * Extend defaults with provided options
     */    
    this.options = $.extend(true, {}, {
      overallFeedback: "You got @score of @total possible points.",
      behaviour: {
        enableRetry: true,
        enableSolutionsButton: true
      }
    }, options);

    /**
     * Keeps track of the content data. Specifically the previous state.
     * @type {Object}
     */
    this.contentData = contentData;
    if (contentData !== undefined && contentData.previousState !== undefined) {
      this.previousState = contentData.previousState;
      this.questionIndex = this.contentData.previousState.progress;
    }

    /**
     * Keeps track of task finished state.
     * @type {boolean}
     */
    this.answered = false;

    /**
     * Keeps track of question index.
     * @type {number}
     */
    this.questionIndex = this.questionIndex || 0;

    /**
     * Keeps track of user score.
     * @type {number}
     */
    this.userScore = 0;

    /**
     * Keeps track of geojson area country name.
     * @type {string}
     */
    this.correctAnswerCountry = '';

    /**
     * Keeps track of nominatim queried country.
     * @type {string}
     */
    this.userAnswerCountry = '';

    /**
     * Keeps track of max score.
     * @type {number}
     */
    this.maxPointsPerQuestion = 1000;
    this.maxScore = this.maxPointsPerQuestion * this.options.questions.length;

    /**
     * Keeps track of leaflet map.
     * @type {number}
     */
    this.theMap = undefined;

    /**
     * Keeps track of leaflet map layers.
     * @type {Object} Object containing L.marker or L.FeatureGroup
     */
    this.mapLayers = {
      'userAnswerMarker': undefined,    //Keeps track of user answer map marker.
      'correctAnswerMarker': undefined, //Keeps track of correct answer map marker.
      'correctAnswerArea': undefined,   //Keeps track of correct answer map area.
      'solution': undefined             //Keeps track of showed solution in the map.
    };

    H5P.EventDispatcher.call(this);
    var self = this;
    this.on('resize', self.resize, self);
  }

  GeoQuiz.prototype = Object.create(Question.prototype);
  GeoQuiz.prototype.constructor = GeoQuiz;

  /**
   * Registers this question type's DOM elements before they are attached.
   * Called from H5P.Question.
   */
  GeoQuiz.prototype.registerDomElements = function () {
    var self = this;

    // Register task introduction text
    //self.setIntroduction(self.options.intro);

    // Register task content area
    self.setContent(this.createContent());
  }

  /**
   * Create wrapper and main content for question.
   * @returns {H5P.jQuery} Wrapper
   */
   GeoQuiz.prototype.createContent = function () {
    //var self = this;
    this.defineMarkers();
    this.$wrapper = $('<div>', {
      'class': 'h5p-geoquiz'
    })
    // Let's shuffle the questions
    this.options.questions = H5P.shuffleArray(this.options.questions);

    this.$overlayContainer = $('<div/>', {
      'id': 'h5p-geoquiz-main-content'
    }).appendTo(this.$wrapper);
    
    this.buildIntroductionPage(this.$overlayContainer);
    this.buildQuestionPage(this.$wrapper);
    this.buildAnswerPage(this.$wrapper);
    this.buildFeedbackPage(this.$wrapper);

    this.$mapContainer = $('<div/>', {
      'id': 'h5p-geoquiz-map-content'
    }).appendTo(this.$wrapper);

    this.theMap = $('<div>', {
      'class': 'h5p-geoquiz-map',
      'id': 'h5p-geoquiz-map',
      html: '&nbsp;'
    });

    this.$mapContainer.append(this.theMap);
    this.$wrapper.append(this.$overlayContainer);
    this.$wrapper.append(this.$mapContainer);
    this.loadMap();
    return this.$wrapper;
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

    // Add retry button, if enabled and as standalone task
    var geoQuizButtons = $('<div/>', {
      'id': 'h5p-geoquiz-buttons-container',
      'class': 'child',
    }).appendTo(answerContent);

    // Add solutions button, if enabled and as standalone task
    var enableSolutionsButton = this.options.behaviour.enableSolutionsButton;
    if((enableSolutionsButton === true) && (this.contentData.standalone === true)){
      JoubelUI.createButton({
        'class': 'h5p-geoquiz-show-solution child',
        'id': 'h5p-geoquiz-show-solution',
        'html': this.options.showSolutionsBtnLabel,
      }).click(function () {
        self.showQuestionSolution();
      }).appendTo(geoQuizButtons);
    }

    // Add next button
    JoubelUI.createButton({
      'class': 'h5p-geoquiz-next child',
      'id': 'h5p-geoquiz-next',
      'html': this.options.nextBtnLabel,
    }).click(function () {
      self.questionIndex++;
      $('#h5p-geoquiz-answer-container').hide();
      self.showQuestion();
    }).appendTo(geoQuizButtons);

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

    // Add overall feedback score bar
    this.overallFeedbackScoreBar = new H5P.JoubelScoreBar(this.getMaxScore());
    this.overallFeedbackScoreBar.appendTo(feedbackContent);

    // Add retry button, if enabled and as standalone task
    var geoQuizButtons = $('<div/>', {
      'id': 'h5p-geoquiz-buttons-container',
      'class': 'child',
    }).appendTo(feedbackContent);

    var enableRetry = this.options.behaviour.enableRetry;
    if((enableRetry === true) && (this.contentData.standalone === true)) {
      this.$retryButton = JoubelUI.createButton({
        'class': 'h5p-results-retry-button h5p-invisible h5p-button',
        'html': this.options.retryBtnLabel
      }).click(function () {
        self.resetTask();
      }).appendTo(geoQuizButtons);
    }
  }
  
  /**
   * Show the actual question from question set
   */
  GeoQuiz.prototype.showQuestion = function () {
    var self = this;

    // rebind click event
    //self.map.on('click', self.addMarker, {geoquiz: self});

    // Reset stored informations
    self.scoreBar.setScore(0);
    self.userAnswerCountry = '';
    self.correctAnswerCountry = '';

    if (self.mapLayers.userAnswerMarker !== undefined) {
      self.map.removeLayer(self.mapLayers.userAnswerMarker);
      self.mapLayers.userAnswerMarker = undefined;
    }
    if (self.mapLayers.correctAnswerMarker !== undefined) {
      self.map.removeLayer(self.mapLayers.correctAnswerMarker);
      self.mapLayers.correctAnswerMarker = undefined;
    }
    if (self.mapLayers.correctAnswerArea !== undefined) {
      self.map.removeLayer(self.mapLayers.correctAnswerArea);
      self.mapLayers.correctAnswerArea = undefined;
    }
    
    self.triggerXAPI('interacted');

    // Check if we are at the end of the quiz or we have other questions
    if (self.questionIndex > (self.options.questions.length - 1) ) {
      self.answered = true;

      // No questions left, add overall feedback using "You got @score of @total points"
      self.showEvaluation();

      // Trigger xAPI completed event
      self.triggerXAPIScored(this.getScore(), this.getMaxScore(), 'answered');
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
    self.answered = false;
    self.userAnswerCountry = '';
    self.correctAnswerCountry = '';
    self.mapLayers.userAnswerMarker = undefined;
    self.mapLayers.correctAnswerMarker = undefined;
    self.mapLayers.correctAnswerArea = undefined;
    self.mapLayers.solution = undefined;
    self.questionIndex = 0;
    self.userScore = 0;
    self.options.questions = H5P.shuffleArray(self.options.questions);
    for (index in self.options.questions) {
      var question = self.options.questions[index];
      self.map.removeLayer(question.solution);
    }
    
    $('#h5p-geoquiz-feedback-container').hide();
    self.showQuestion();
  }

  /**
   * Show evaluation widget, i.e: 'You got x of y points'
   */
  GeoQuiz.prototype.showEvaluation = function () {
    var self = this;
    var maxScore = self.getMaxScore();
    var score = self.getScore();
    var scoreText = self.options.overallFeedback.replace('@score', score).replace('@total', maxScore);
    
    $('#h5p-geoquiz-feedback-content-message').html( scoreText );
    self.overallFeedbackScoreBar.setScore(score);
    $('#h5p-geoquiz-question-container').hide();
    $('#h5p-geoquiz-feedback-container').css({'opacity':0}).show();
    $('#h5p-geoquiz-feedback-container').animate({'opacity':1}, 300);

    // Show/Hide retry button, if enabled
    var enableRetry = self.options.behaviour.enableRetry;
    if((enableRetry === true) && (self.contentData.standalone === true)) {
      if (self.getScore() < self.getMaxScore()) {
        self.$retryButton.removeClass('h5p-invisible');
      } else {
        self.$retryButton.addClass('h5p-invisible');
      }
    }
    
    self.trigger('resize');
  };

  /**
   * Show solution for actual question
   */
  GeoQuiz.prototype.showQuestionSolution = function () {
    var self = this;
    
    $('#h5p-geoquiz-answer-content').css({'opacity':0});

    // Add location answer if set
    if (self.mapLayers.correctAnswerMarker !== undefined) {
      self.mapLayers.correctAnswerMarker.addTo(self.map);
    }

    // Add area answer if set
    if (self.mapLayers.correctAnswerArea !== undefined) {
      self.map.addLayer(self.mapLayers.correctAnswerArea);
    }

    $('#h5p-geoquiz-answer-content').delay(800).animate({'opacity':1}, 800);
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
    self.geoquiz.mapLayers.userAnswerMarker = L.marker(event.latlng, { draggable: false });
    if (question.locationType === 'location') {
      var latlng = self.geoquiz.coordSplit(question.typeLocation);
      // Store right answer as a leaflet marker
      self.geoquiz.mapLayers.correctAnswerMarker = L.marker(latlng, { draggable: false });
      question.solution = self.geoquiz.mapLayers.correctAnswerMarker;
      question.solution.bindTooltip(question.locationLabel);
      var distance = parseInt(latlng.distanceTo(event.latlng) / 1000);
      points = (self.geoquiz.maxPointsPerQuestion - distance);
      if (points < 0) {
        points = 0;
      }
      // Store user answer as a leaflet marker with icon
      var answerIcon = self.geoquiz.whichMarker(points);
      self.geoquiz.mapLayers.userAnswerMarker = L.marker(event.latlng, { draggable: false, icon: answerIcon }).addTo(self.geoquiz.map);
      self.geoquiz.updateScore(points);
    } else if (question.locationType === 'area') {
      var area = self.geoquiz.options.questions[self.geoquiz.questionIndex].typeArea;
      self.geoquiz.isMarkerInsideArea(area, self.geoquiz.mapLayers.userAnswerMarker).then(function (response) {
        if (self.geoquiz.userAnswerCountry === self.geoquiz.correctAnswerCountry) {
          points = parseInt(self.geoquiz.maxPointsPerQuestion);
        }
        question.solution = self.geoquiz.mapLayers.correctAnswerArea;
        question.solution.bindTooltip(question.locationLabel);
        // Store user answer as a leaflet marker with icon
        var answerIcon = self.geoquiz.whichMarker(points);
        self.geoquiz.mapLayers.userAnswerMarker = L.marker(event.latlng, { draggable: false, icon: answerIcon }).addTo(self.geoquiz.map);
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
    self.mapLayers.correctAnswerArea = undefined;
    return new Promise(function(resolve, reject) {
      self.loadArea(area).then(function(loadAreaResponse) {
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
        self.correctAnswerCountry = '';
        $.getJSON( self.getLibraryFilePath('') + "geojson-data/" + area + ".geo.json")
          .done(function( json ) {
            self.mapLayers.correctAnswerArea = new L.FeatureGroup();
            var geojsonLayer = L.geoJson(json);
            geojsonLayer.eachLayer(
              function(l){
                self.correctAnswerCountry = l.feature.properties.name;
                self.mapLayers.correctAnswerArea.addLayer(l);
              }
            );
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
    self.userAnswerCountry = 'Unknow';
    return new Promise(function(resolve, reject) {
      // Force language to en to match geojson naming
      var url = "https://nominatim.openstreetmap.org/search?q="+x+","+y+"&format=json&addressdetails=1&accept-language=en";
      $.getJSON( url )
          .done(function( data ) {
            var queryCountry = '';
            $.each( data, function( key, val ) {
              self.userAnswerCountry = val.address.country;
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
    $('#h5p-geoquiz-answer-container').show();
    //$('#h5p-geoquiz-answer-container').css({'opacity':0}).show();
    //$('#h5p-geoquiz-answer-container').animate({'opacity':1}, 800);
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
      return this.icons.red;
    } else if (percent <= 50) {
      return this.icons.orange;
    } else if (percent <= 75) {
      return this.icons.yellow;
    } else if (percent > 75) {
      return this.icons.green;
    }
  }

  /**
   * Define markers icon for user answer
   */
  GeoQuiz.prototype.defineMarkers = function () {
    // Create the answer marker icons
    var imgPath = this.getLibraryFilePath('') + 'css/images/';

    // more then 75%
    var greenIcon = new L.Icon({
      iconUrl: imgPath + 'marker-icon-2x-green.png',
      shadowUrl: imgPath + 'marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    // less then 75%
    var yellowIcon = new L.Icon({
      iconUrl: imgPath + 'marker-icon-2x-yellow.png',
      shadowUrl: imgPath + 'marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    // less then 50%
    var orangeIcon = new L.Icon({
      iconUrl: imgPath + 'marker-icon-2x-orange.png',
      shadowUrl: imgPath + 'marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    // less then 25%
    var redIcon = new L.Icon({
      iconUrl: imgPath + 'marker-icon-2x-red.png',
      shadowUrl: imgPath + 'marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
    
    this.icons = {
      'green': greenIcon,
      'yellow': yellowIcon,
      'orange': orangeIcon,
      'red': redIcon
    }
  }

  /**
   * The following functions implements the Question type contract
   */

   /**
   * Checks if all has been answered.
   *
   * @returns {Boolean}
   */
   GeoQuiz.prototype.getAnswerGiven = function () {
    if (this.answered) {
      return true;
    }
    return false;
  };

  GeoQuiz.prototype.getScore = function () {
    return this.userScore;
  };

  GeoQuiz.prototype.getMaxScore = function () {
    return this.maxScore;
  };

  GeoQuiz.prototype.getTitle = function () {
    var title = '';
    // if the are still questions, use it as title
    if (this.questionIndex <= (this.options.questions.length - 1) ) {
      var question = this.options.questions[this.questionIndex];
      title = question.text ? H5P.createTitle(question.text) : '';
    }
    return title;
  };

  // TODO:
  GeoQuiz.prototype.showSolutions = function () {
    var self = this;
    this.$feedbackContainer.hide();
    for (index in this.options.questions) {
      var question = this.options.questions[index];
      question.solution.addTo(this.map);
    }
  };

  return GeoQuiz;
})(H5P.jQuery, H5P.JoubelUI, H5P.Question);