
/* ***********************************************
 *   
 *   Framework for client-side dynamic form UI
 * 
 *    + Tabs and tab navigation (via TabFlow plugin)
 *    + Dynamic elements
 *    + Client-side validation (via Validation plugin)
 * 
 *   See devdocs.txt for more detailed 
 *    documentation
 *
 *  @TODO-onstance: move FormController definition out 
 *  of global namespace (define within jQuery.fn.formController)
 * 
   ***********************************************  */  


 // declare fxns for older browsers
if (!window.console) console = {log: function() {}}; 


// wrap plugin class in a closure to prevent namespace pollution
(function($){

  /**
   * Class
   * @param {[type]} element [description]
   */
  var FormController = function( formElement, settings )
  {
    this.form = formElement;

    this.formSettings = jQuery.extend( true, {}, this.defaults, settings );

    /**
     *  Form state management
     *  Implementers can add elements to this object to store arbitray state data
     */
    this.state = { form_submitted: false };

    // Get client form settings
    if(settings.custom.customInit) settings.custom.customInit( this );

    // set up form
    this.prepForm();

  };

  /**
   *  Form-specific settings
   *  Client form should set these in implementation of
   *  FormController::customInit
   *  Known keys:
   *    + updateSelector 
   *        jquery selector for updating form.  Defaults to 
   *        'input, select';  Can be modified to handle dynamic
   *        UI elements
   *                           
   */
  FormController.prototype.formSettings = {};

  FormController.prototype.defaults = {
    // These start as arrays for extensibility, then
    // get compiled to a string downstream.
    updateSelector: {
      change:        [ "input" , "select" ] ,
      click:         [ '[type="button"]' , '.user-action' ]
    } ,
    updateNotSelector: {
      change:        [] ,
      click:         []
    } ,
    plugins:         [] ,
    pluginSettings:  {}
  };


  /*
   * Prepare the form 
   * - plugins
   * - call refreshForm()
   */
  FormController.prototype.prepForm = function () {

    // show script-specific elements
    jQuery('.js-only-block').css('display' , 'block');
    jQuery('.js-only-inline').css('display' , 'inline');
    
    // set state flag
    this.state.initializing = true;
      
    // set up plugins 
    this.initPlugins();

    
    // update UI
    this.refreshForm( null ); // suppress errors on load, when no data has been entered

    this.attachHandlers();
   
    // unset state flag
    delete this.state.initializing;

  }

  FormController.prototype.attachHandlers = function () {
    // refresh form after user input.  Add onchange/click/or?? handler for all specified elements,
    // limiting to the scope of the parent form, and allowing for exceptions.
    //   compile input selectors
    var selector;

    for( var key in this.formSettings.updateSelector ) {
      this.formSettings.updateSelector[ key ]    = this.formSettings.updateSelector[ key ].join( "," );
      this.formSettings.updateNotSelector[ key ] = this.formSettings.updateNotSelector[ key ].join( "," );
      selector = this.formSettings.updateSelector[ key ] ;
      if( this.formSettings.updateNotSelector[ key ] ) selector = selector + ':not(' + this.formSettings.updateNotSelector[ key ] + ')';

      jQuery( this.formSettings.formSelector ).delegate( selector , key ,
        function(obj){
          return function( e ){



            obj.refreshForm(e);
          }
        }(this)
      );     
    }

  }

  FormController.prototype.initPlugins = function(){
    this.plugins = {};
    for( var pluginKey in this.formSettings.plugins ) {
      var pluginClass = this.formSettings.plugins[ pluginKey ];

      if( typeof window[ pluginClass ] === 'function' ) {
        // @TODO-ONSTANCE: move plugin defs out of global namespace
        this.plugins[ pluginKey ] = new window[ pluginClass ]( this, this.formSettings.pluginSettings[ pluginKey ] );
      }
    }
    return;
  }

  /**
   * Refresh form
   *   + validate
   *   + update dynamic elements
   * @param  {event} e              triggering event obj
   * @return {void}                
   */
  FormController.prototype.refreshForm = function ( e ){

    // Cache a reference to event.
    // @TODO: Consider: is this reliable? Is there a more sensible way to handle?
    this.state.lastEvent = e;

    // if form has been submitted, note this 
    if ( e && ( e.type == 'submit' && jQuery(e.currentTarget).is(this.formSettings.formSelector ) ) ) {
      this.state.form_submitted = true;
    }

    // call custom 'on change' hook (to be implemented, optionally,
    //  by the 'inheriting' class)
    if( this.customOnChange ) {
      var clientRslt;
      clientRslt = this.customOnChange(e);
    }

    // validate
    this.validateForm(); 

    // @todo-onstance: is this really necessary?  could it be done in updateDynamicElements/customUpdateUI?
    jQuery(this).trigger( 'preUpdateUI' );  // eg., allow tabs controller to do some pre-processing

    // update form elements
    this.updateDynamicElements();

  }

  /**
   * Validate form
   * Wrapping in function to allow convenient hook for plugins
   * @return undefined
   */
  FormController.prototype.validateForm = function ( ) {
    
    var rslt = jQuery(this).trigger( 'requestValidation' , {formController: this} );
    
  }

  /**
   * Check if form has validated
   * Convenience function 
   * IMPORTANT: this function assumes validation has run and is current.
   * @param  {[type]}  [description]
   * @return {boolean}  false if any item in form has failed validation
   */
  FormController.prototype.allValid = function ( ) {
    
    // this temporary flag exists only in the context of this function and the
    //   checkValidation event
    this.state.hasError = false; // default, in case no validation plugin exists

    // raise checkValidation event.  Validation plugin should set flag in 
    // formController.state.hasError.
    jQuery(this).trigger( 'checkValidation' , {formController: this} );

    var hasError = this.state.hasError;
    delete this.state.hasError;  // this should be 'undefined' except in the context of this function

    return ! hasError;
  }

  /*
   * Update dynamic form elements
   * Runs on all change events and any action that causes form to refresh,
   * AFTER all validation.
   */
  FormController.prototype.updateDynamicElements = function () {

    // Allow plugins (ie., Validator) to update display
    jQuery(this).trigger( 'updateDisplay' , {formController:this});  
    
    // Call form update callback
    if(this.customUpdateUI) this.customUpdateUI();

  }

  /**
   * add utility functions to jQuery
   */
  
  /**
   *  htmlEncode() : sanitize user input
   */
  $.extend( {
    htmlEncode: function (value){
        return jQuery('<div/>').text(value).html();
    }
  });
  $.fn.extend( {
    htmlEncode: function (){
      if( this.length == 0 ) return;
      var op = '';
      if( this.val() !== '' ) {
        op = op + jQuery('<div/>').text(this.val()).html();
      } else {
        op = op + this.text();
      }
      return op;
    }
  });


  /**
   * Add plugin to jQuery
   * 
   */
  $.fn.formController = function( options )
  {
      // iterate over jq collection
      return this.each(function( idx, elm )
      {
        var formController = new FormController( this, options );
        // add a reference to the FormController to the form element
        $(elm).data( { 'formController' : formController } );
 
      });
  };

})(jQuery);

