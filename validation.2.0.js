  
/* -----------------------------------------------
 *   
 *   Validation "Plugin" / "Class"
 * 
 *   See devdocs.txt for more detailed 
 *    documentation
 *
 *   Note: configuration options and code are set/declared in FormController instantiation
 *         (typically in formCustom.js)
   -----------------------------------------------  */ 


// wrap plugin class in a closure to prevent namespace pollution
(function($){


  
  UIValidation = function( parent ){
    
    this._parent = parent;

    if( parent.formSettings.pluginSettings[ 'Validation' ].validationFormSettings ) {
      var config = parent.formSettings.pluginSettings[ 'Validation' ].validationFormSettings;
    }

    /* 
     * Declare validation objects and their settings
     * Array of UIValidation.Field objects
     * Note: see UIValidation.Field docs and devdocs.txt for more info
     */
    this.items = {};

    this.config = {
      formMsgSelector: '#form-message' ,
      formMessage: 'More information is needed.' ,
      formMessageFadeIn: 600 ,
      formMessageFlashInterval: 400 ,
      formMessageFlashColor: '#ff9' ,
      scrollToFormMsg: false ,
      interceptSubmission: true ,
      validators: {} 
    };

    jQuery.extend( true , this.config , config );


    // custom validators.  Client may supply these via a script extending this
    // class.  Implement UIValidation.prototype.customValidators() and assign
    // validation functions to 
    //  + this.config.validators.groups 
    //    (map object keyed by group keys)
    //  + this.config.validators.fields
    //    (map object keyed by field ids)
    this.config.validators.groups = {};
    this.config.validators.fields = {};
    if( parent.formSettings.custom.customValidators ) {
      parent.formSettings.custom.customValidators( this );
    }

    // wrap custom validator functions in closures to supply ref to
    // parent object
    for(var custValItem in this.config.validators.groups) {
      var fn = this.config.validators.groups[custValItem].toString();
      var validator = this;  // make validator obj avail to fxn via closure 
      this.config.validators.groups[custValItem] = eval(
        '(function(){return ' + fn + '}())');
    }

    


    // Get field configuration settings passed in from client
    if( parent.formSettings.pluginSettings[ 'Validation' ].validationFields ) {
      this.items = parent.formSettings.pluginSettings[ 'Validation' ].validationFields;
    }



      
    /*
     * Hold validation state for fields
     * When a field is validated, it's registered here, as:
     *  state.fields[ {fldkey] ] = {
     *    validated: [true|false]
     * }
     * Notes: 
     *  + User can programatically add items to the state object
     *    as a way of handling complex validation requirements
     *  + group states are handled implicitly, via 
     *    their constituent fields
     *  
     */
    this.state = {};
    
    /*
     * Default validation (and input masking) formats
     * Can be modified/extended at run time, during config setup
     * API:
     *  {format_key} : {
     *    keyMask: { regex pattern (as string) for acceptable key inputs } 
     *    inputRule: { regex pattern (as regexp) for acceptable field input } 
     *    hint: (optional) format hint to display in err/help messages
     *  }
     */
    this.formats = {
      integer: {
        keyMask: '[0-9]' ,
        inputRule: /^[0-9]*$/ 
      } ,
      dollar: {
        keyMask: '[0-9\.]' ,
        inputRule: /^[0-9]*(|\.[0-9]{0,2})$/  
      } ,
      zipcode: {
        keyMask: '[0-9\-]' ,
        inputRule: /^[0-9]{5}(|-[0-9]{4})$/ 
      } ,
      email: {
        keyMask: '.' ,
        inputRule: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i 
      } ,    
      phone: {
        keyMask: '[0-9\-\(\)]' ,
        inputRule: /^\(?(\d{3})\)?[- ]?(\d{3})-?(\d{4})$/ ,
        hint: '(123) 456-7890' 
      }  
    };


    // add custom formats passed in from client
    if( parent.formSettings.pluginSettings[ 'Validation' ].validationFormats ) {
      for( var format in parent.formSettings.pluginSettings[ 'Validation' ].validationFormats ){
        this.formats[format] = 
            parent.formSettings.pluginSettings[ 'Validation' ].validationFormats[format];  // json data output by form script
      }
    }
    

    //  NOTE: more in-line code after fxn defs
    

    /*
     * Apply DOM changes
     *  + input masks
     */
    this.initializeUI = function(){
      
      // set debug flags
      this.debuglog = {
        fieldvalidation: true 
      }
      
      // apply field input key masks
      for( fldKey in this.items ) {
        fld = this.items[ fldKey ];
        if( fld.validation.format ) {
          // assure format is registered
          if( this.formats[ fld.validation.format ] ) {
            elm = jQuery( '#' + fld.id );
            maskPattern = this.formats[ fld.validation.format ].keyMask;
            elm.filter_input( { regex: maskPattern } );
          }
        }
      }
      
    }
    
    /**
     * allow application to override settings at runtime
     * @param  {object} settings settingKey: value
     * @return Null
     */
    this.applySettings = function( settings ){
      jQuery.extend( true , this.config, settings );
    }





    /**
     * Validate form
     * Note: custom validators are implicitly called by convention.  Client
     * adds custom validation fxns to the validator object, keyed by group
     * or field name. See docs for details.
     * @return undefined
     */
    this.validateForm = function( e, data ) {
console.log('validateForm()');
      // suppress errors while initializing form
      if( this._parent.state.initializing ) {

        this.state._suppressErrors = true;
   
      // otherwise use default or override from plugin
      } else {

        // default
        this.state._suppressErrors = true;

        // call plugin preRefreshForm hooks (tabflow plugin uses this to handle error suppression)
        jQuery(this).trigger( 'preValidateForm' );  // eg., allow tabs controller to set suppressErrors
        

      }



      // Call optional client-supplied validation function  
      if( this.config.customOnValidate ){  

        this.config.customOnValidate( this._parent );  // eg, if tabbed form, validate by tab groups
          
      } else {

        this.validateAll();

      }

    }

    /*
     * Validate a field
     * Sets this.state[ fldKey ].validated
     * @param fldKey: key of field as registered in items obj
     * @return 
     *    + true if field validates, or is skipped
     *    + false if item doesn't validate
     * 
     * @TODO-onstance: implement custom validation fxns, as with field groups
     */
    this.validateField = function( fldKey ) {

      // get item
      var fldConfig = this.items[ fldKey ]; 

      // check for skip or custom flag
      if( fldConfig.skip || fldConfig.custom ) {
        // clear any old results (but ignore custom items altogether )
        if( fldConfig.skip ) {
          if( this.state[ fldKey ] ) delete this.state[ fldKey ].validated;
        }
        return true;
      }

      // default state to validated = true
      if( ! this.state[ fldKey ] ) this.state[ fldKey ] = {};
      this.state[ fldKey ].validated = true;

      // get DOM obj 
      var fld = jQuery( '#' + fldConfig.id ); 
      var fldType = fld.attr( 'type' );

      // check for required
      if( fldConfig.validation.required ) {


        if ( fldType == 'select-one' ) {
          this.state[ fldKey ].validated = 
            ( fld.val() !== "0"
               &&
              fld.val() !== ""
            );
        } else if ( fldType == 'text' || fldType == 'hidden') {
          this.state[ fldKey ].validated = fld.val() !== "";
        } else if ( fldType == 'checkbox' ) {
          this.state[ fldKey ].validated = fld.attr('checked');
          if(this.state[ fldKey ].validated === undefined) this.state[ fldKey ].validated = false;
        } else if ( fldConfig.type == 'radios' ) {
          this.state[ fldKey ].validated = jQuery('input[name=' + fldConfig.id + ']:checked').length > 0;
        }

      }   

      // check against format
      if( fldConfig.validation.format ) {

        // assure format is registered
        if( this.formats[ fldConfig.validation.format ] ) {
          var pattern = this.formats[ fldConfig.validation.format ].inputRule;
          if ( fld.val().search( pattern ) == -1 ) {
            // handle null val on non-req'd fld
            if( ! fldConfig.validation.required && fld.val() !== '' ) {
              this.state[ fldKey ].validated = false;            
            } else {
              this.state[ fldKey ].validated = false; 
            }
          } 
        }
      }
      return this.state[ fldKey ].validated;
      
    }



    
    /**
     * Validate all fields in form
     * Handles custom items as follows:
     *   if item.validation is set, uses it
     *   if item.validation is not set, an error occurs
     *   (the app is responsible for assuring custom items are
     *     validated before calling this function)
     * @return {boolean}               FALSE if error found
     */
    this.validateAll = function() {

      var hasError = false;

      var flds = this.items

      for( var fldKey in flds ) {
        var fld = flds[ fldKey ] ;
     
        // special handling for custom items
        if( fld.custom ) { 
          var rslt = this.state[ fldKey ].validated;
        } else {
          rslt = this.validateField( fldKey );
        }
        if( ! rslt ) hasError = true;
        
      }
      
      return ! hasError;
    
    }

    
    /*
     * Validate a group of fields
     * If a custom validation function exists, hands off to that function.
     * Otherwise: 
     * Iterates flds, filtering by fld.group
     * Handles custom items as follows:
     *   if item.validation is set, uses it
     *   if item.validation is not set, an error occurs
     *   (the app is responsible for assuring custom items are
     *     validated before calling this function)
     * @param groupKey: key of field as registered in item field objects' .group member
     *      can be array for multiple groups: [ group 1 , group 1b ]
     * @param applyDefaults: set to true to override custom validation function.
     *      This allows custom validation functions to use this function to
     *      apply default validation logic without causing a recursion back
     *      into the custom function.
     * @return true if all fields validate, false if not
     * 
     */
    this.validateGroup = function( groupKey , applyDefaults ) {
    
   //    if ( ! applyDefaults ) applyDefaults = false;
      
      if( ! applyDefaults && this.config.validators.groups[groupKey] ){
        return this.config.validators.groups[groupKey]( this );
      }

      var hasError = false;
      
      var flds = this.getGroupFields( groupKey );

      for( var fldKey in flds ) {
        var fld = flds[ fldKey ] ;
        if( jQuery.inArray( groupKey , fld.groups ) != -1) {
          // special handling for custom items
          if( fld.custom ) {
            var rslt = this.state[ fldKey ].validated;
          } else {
            rslt = this.validateField( fldKey );
          }
          if( ! rslt ) hasError = true;
        }
      }
      
      return ! hasError;
    
    }


    /*
     * Validate arbitrary group of fields
     * @param fldKeys: array of keys from ValidateUI.items
     * @return True if all validate, False if any field fails
     */  
    this.validateMultiple = function( fldKeys ) {
      
      var allGood = true;
      
      // loop selectors array
      for( idx = 0 ; idx < fldKeys.length ; idx++ ) {
        
        fldKey = fldKeys[ idx ];
        rslt = this.validateField( fldKey );
         
        if( ! rslt ) allGood = false;
        
      }
      
      return allGood;    
      
    }
    
    /*
     * Check if any field on form has error
     * 
     */
    this.hasError = function( ){

      var hasError = false;
      for( var fld in this.items ) {
        if( this.state[ fld ] !== undefined ) {
          if( ! this.state[ fld ].validated ) {
            hasError = true;
          }
        } else {
          // note: for some reason the above if block causes the hasError = true line to execute
          // when the condition is false.  Adding this null Else block resolves this.
        }
      }
      return hasError;
    }
    
    
    this.handleUpdateDisplay = function( e, data ) {

      var formController = this._parent;

      var showFormMsg ;
      var suppressFormMsg; 
      var fldMsgsConfig;


      // allow client or plugins to override error messaging logic
      if( this.customErrorMessaging ){

        var msgFlags = this.customErrorMessaging( this );
        showFormMsg = msgFlags[ 'showFormMsg' ];

      } 


      else {

        // Note form message is handled after validation, in order to prevent
        //  on/off flashing of message (which causes form elms to shift up/down)
        if( this.state._suppressErrors && ! formController.state.form_submitted ) { // global suppression not on 
          showFormMsg = false; 
          suppressFormMsg = true;
          fldMsgsConfig = false; 
        } else {
          showFormMsg = true; 
          suppressFormMsg = false;
          fldMsgsConfig = true;  // show all field-level messages
        }

        this.updateDisplay( fldMsgsConfig , suppressFormMsg );
            
      }
    
      if( ! showFormMsg ) jQuery(this.config.formMsgSelector).hide();


    }

    jQuery(this._parent).bind( 'updateDisplay' , jQuery.proxy( this.handleUpdateDisplay , this ));

    /*
     * Update display of error messages
     * + Clear old messages
     * + Display field-level messages (unless suppressed)
     * + Display form-level messages (unless suppressed)  
     * @param suppressFieldMsgs
     *    true (default): display all field messages
     *    false:  display no field messages
     *    [object]: 
     *      ->showGroups: dispaly messages in the specified groups
     * @param fieldMsgs
     *    (object) {
     *        showGroups []  # array of group keys to display fld
     *                       #  msgs for (all others will be suppressed).
     *                       #  If showGroups is set, suppressGroups 
     *                       #  is ignored
     *        hideGroups []  # array of group keys to NOT display
     *                       #  fld msgs for.  This is ignored if
     *                       #  showGroups is set.
     */
    this.updateDisplay = function( fieldMsgs , suppressFormMsg ) {

      // set param dflts
      if( fieldMsgs === undefined || fieldMsgs === null ) fieldMsgs = true;
      
      // clear all old field messages
      //  note form message is handled after validation, in order to prevent
      //  on/off flashing of message (which causes form elms to shift up/down)
      jQuery( '.errmsg' ).html('');
      jQuery( '.errbox' ).removeClass( 'errbox' );   
       

      // field-level messages, per passed-in options 
      if( fieldMsgs ) { 
        
        // display by group
        if( typeof fieldMsgs === 'object' ) {
          
          // show by group(s)
          if( fieldMsgs.showGroups ) {

            this.displayFieldMessages( fieldMsgs.showGroups );
            
          // exclude by group(s)
          } else {
            
            // @TODO-ONSTANCE: build out handling of 'hideGroups'
            //  need to compile all groups then remove those specified
            
          }      
          
        // display all field msgs  
        } else { 
          this.displayFieldMessages( );
        }
      }

       // devnote: shouldn't this be checking for the existence of errors in the first place??

      // form-level message
      if( ! suppressFormMsg && this.hasError() ) {
        jQuery('#form-message' ).html( this.config.formMessage );
        jQuery('#form-message').show( this.config.formMessageFadeIn );
        if( this.config.scrollToFormMsg ) {
          var offset = jQuery('#form-message').offset();
          jQuery('html').animate({scrollTop : offset.top - 50 },'slow');        
        }
      }
            
    }
    
    /**
     * Display field-level error messages, per settings
     * @param limitToGroups: array of group keys; only err items in these
     *                       groups will be displayed
     */
    this.displayFieldMessages = function( limitToGroups ) {
console.log(this.state);
      // loop in-/validated items
      for( fldKey in this.state ) {
       
        // is invalid??
        if( this.state[ fldKey ][ 'validated' ] != undefined && ! this.state[ fldKey ].validated ) {

          // check in included group, if req'd
          var doThisOne = true;
          if ( limitToGroups ) {
            
            doThisOne = false;
            
            // loop included groups
            for ( var inGrpIdx = 0 ; inGrpIdx < limitToGroups.length ; inGrpIdx++ ) {
              
              // check item for membership in this group
              if( jQuery.inArray( 
                    limitToGroups[ inGrpIdx ], 
                    this.items[ fldKey ].groups ) > -1 ) {

                var doThisOne = true;
                break;
             
              } 
              
            }
          
          }
          
          tempMsgElmSelector 

          // Display error message
          if( doThisOne ) { 


            var errObj = this.items[ fldKey ].validation;
            var tempMsgElmSelector = errObj.msgElmSelector; // default msg location

            // highlight field/region
            jQuery( errObj.errorElmSelector ).addClass( 'errbox' );
            // get the fld msg selector, and add the elm if necessary
            if ( ! errObj.msgElmSelector ) {

              // if "After Elm" is specified, use that
              if ( errObj.msgAfterElmSelector ) {
                tempMsgElmSelector = errObj.msgAfterElmSelector + ' ~ .errmsg'; // note "next sibling(s)" selector, ~ 
                
              // otherwise, use the main err elm  
              } else {
                tempMsgElmSelector = errObj.errorElmSelector + ' ~ .errmsg'; // note "next sibling(s)" selector, ~ 
              }
              // add elm if necessary
              if( jQuery( tempMsgElmSelector ).length === 0 ) {
                var afterElm = jQuery( ( errObj.msgAfterElmSelector ? errObj.msgAfterElmSelector : errObj.errorElmSelector ) );
                jQuery( afterElm ).after( 
                  '<div class="errmsg"></div>'
                );
              }
              
            }
    
            // print fld msg in spec'd location  
            jQuery( tempMsgElmSelector ).html( errObj.msg );
          
          } //  /doThisOne
          
        }
      }
           
      
    }

    /*
     * Bulk check group fields are 'empty'
     * @param group: field group label
     * @return TRUE if any item in group has a non-null value
     */
    this.groupIsEmpty = function( group ) {
      
      var empty = true;
      
      var grpFlds = this.getGroupFields( group );
      
      // loop fields
      for( var fldKey in grpFlds ) {
        
        var selector = '#' + grpFlds[ fldKey ].id;
        empty = this.fieldIsEmpty( selector );
        if( ! empty ) return false;       
        
      }
      
      return true;
      
    }  
    /*
     * Bulk check fields are 'empty', by jquery selector(s)
     * @param selectors: array of jQuery selectors
     *   All matched elements will be checked
     * @return TRUE if any selected element has a non-null value
     */
    this.fieldsAreEmpty = function( selectors ) {
      var empty = true;
      
      // loop selectors array
      for( idx = 0 ; idx < selectors.length ; idx++ ) {
        
        selector = selectors[ idx ];
        
        elms = jQuery( selector );
        
        // loop selected elements (not using jQuery().each() because it makes the logic hard here)
        for( var elmIdx = 0 ; elmIdx < elms.length ; elmIdx ++ ) {         
          elm = jQuery( elms[ elmIdx ] );
          empty = this.fieldIsEmpty( elm );
          if( ! empty ) return false;       
        } 
        
      }
      
      return true;
      
    }
    
    /*
     * Check if a field is empty, with type-specific handling:
     *   + text: {null string}
     *   + select: "0"
     *   + checkbox: attr(checked) == false
     *   + radios: attr(checked) == false
     * @param elm: 
     *   + jQuery selection
     *      -OR-
     *   + jQuery selector 
     * (in either case, only first selected item will be checked)
     * @return:
     *  True if field is empty or no field is specified
     *  False if field is not empty
     */
    this.fieldIsEmpty = function( elm ) {
      
      // handle param = selector
      if( typeof elm == 'string' ) {
        elm = jQuery( elm );
      }

      fldType = elm.attr('type');
      if ( fldType == 'select-one' ) {
        empty = elm.val() == "0";
      } else if ( fldType == 'text' ) {
        empty = elm.val() == "";
      } else if ( fldType == 'checkbox' ) {
        empty = ! elm.attr('checked');
      } else if ( fldType == 'radio'  ) {
        empty = ! elm.attr('checked');
      }
      
      return empty;
      
      //if( ! empty ) return false;

    }
    
    
    /*
     * set (or unset) the 'skip' flag on one or more items
     * @param fldKeys: keys of ValidationUI.items
     * @param unSkip: true to set item(s).skip to false
     */
    this.skipFields = function( fldKeys , unSkip ) {
      skipEm = ( unSkip === null ? true : ! unSkip );
      for( var fldKeyIdx = 0 ; fldKeyIdx < fldKeys.length ; fldKeyIdx ++ ){
        this.items[ fldKeys[ fldKeyIdx ] ].skip = skipEm;
      }    
    } 
    
    /**
     *  Set skip flag on items in a group
     *  @see skipFields()
     */
    this.skipGroupFields = function( groupKey , unSkip ) {

      var flds = this.getGroupFields( groupKey );
      var fldKeys = Array();
      for( fldKey in flds ) {
        fldKeys.push( fldKey )
      }
      this.skipFields( fldKeys , unSkip );
      
    }


    /*
     * Get fields that belong to a group
     * @param groupKey: key of group
     * @return: keyed object of fields belonging to group
     */
    this.getGroupFields = function( groupKey ) {
      
      var flds = {};
      
      for( fldKey in this.items ) {
        fld = this.items[ fldKey ] ;
        if( jQuery.inArray( groupKey , fld.groups ) != -1) {
          flds[ fldKey ] = this.items[ fldKey ];
        }
      }
    
      return flds;
      
    }
    
    /*
     * register validation status for custom item
     */
    this.validateCustomItem = function( itemKey , isValid ) {
      if( ! this.state[ itemKey ] ) this.state[ itemKey ] = {};
      this.state[ itemKey ].validated = isValid;
    }
    
    
    /*
        -- -- -- --   Input key masking jquery "plugin"  -- -- -- --
        
      Author - Rudolf Naprstek
      Website - http://www.thimbleopensource.com/tutorials-snippets/jquery-plugin-filter-text-input
      Version - 1.3.0
      Release - 28th January 2012
    
    */  
    jQuery.fn.extend({   

        filter_input: function(options) {  

          var defaults = {  
              regex:".*",
              live:false
          }  
                
          var options =  jQuery.extend(defaults, options);  
          var regex = new RegExp(options.regex);
          
          function filter_input_function(event) {

            var key = event.charCode ? event.charCode : event.keyCode ? event.keyCode : 0;

            // 8 = backspace, 9 = tab, 13 = enter, 35 = end, 36 = home, 37 = left, 39 = right, 46 = delete
            if (key == 8 || key == 9 || key == 13 || key == 35 || key == 36|| key == 37 || key == 39 || key == 46) {

              if (jQuery.browser.mozilla) {

                // if charCode = key & keyCode = 0
                // 35 = #, 36 = $, 37 = %, 39 = ', 46 = .
         
                if (event.charCode == 0 && event.keyCode == key) {
                  return true;                                             
                }

              }
            }

            var string = String.fromCharCode(key);
            if (regex.test(string)) {
              return true;
            } else if (typeof(options.feedback) == 'function') {
              options.feedback.call(this, string);  
            }
            return false;
          }
          
          if (options.live) {
            jQuery(this).live('keypress', filter_input_function); 
          } else {
            return this.each(function() {  
              var input = jQuery(this);
              input.unbind('keypress').keypress(filter_input_function);
            });  
          }
          
        }  
    });  

    // intercept form submit() to perform final validation
    if( this.config.interceptSubmission ) { 
      jQuery(this._parent.formSettings.formSelector).bind( 'submit' ,
        {controller: this._parent} ,
        function(){ 
          return function(e) {
            var controller = e.data.controller;
            controller.refreshForm( e, false );
            return controller.allValid();

          }
        }()
      );
    }

    // register validation event listener
    jQuery(this._parent).bind( 'requestValidation' ,  jQuery.proxy( this.validateForm , this ) );

    this.checkValidation = function( e, data ) {
        // debugger;
      data.formController.state.hasError = this.hasError();
    }

    // register check-validation event listener
    jQuery(this._parent).bind( 'checkValidation' ,  jQuery.proxy( this.checkValidation , this ) );
      
    // Apply DOM mods
    this.initializeUI();

  }  

  /** 
   * "Data class" for field configuration 
   * More info in devdocs.txt
   */
  UIValidation.Field = function(){
    this.id = null;
    this.groups = Array();
    this.validation = {
      required: null ,
      format: null ,
      msg: null ,
      errorElmSelector: null ,
      msgAfterElmSelector: null 
    }   
  }


  /**
   * Add plugin to jQuery
   * @TODO-onstance: this is not used. the thought is to implement
   *   forms plugins as jQuery plugins.  Not sure what the benefit would
   *   be, beyond uncluttering the global namespace (which could be 
   *   acheived other ways.)
   */
  $.fn.validationUI = function( options )
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

