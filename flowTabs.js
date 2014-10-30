



/**  +++++++++++++++++++++++++++++++++++++++++++++++++++++
 * 
 *    FlowTabs Controller
 * 
 *    Wraps JQueryUI.tabs plugin to implement a multistep form as a sequence of
 *    tabs.  
 *    
 *    Users are prevented from navigating forward in the sequence
 *    until the current tab is completed.
 * 
 *    Backwards navigation is allowed, but the user is not permitted
 *    to leave a tab until it validates.  This helps manage the 
 *    data entry process for the user. In particular, it's impossible 
 *    for there to be an error on any tab other than the current one.  
 * 
 *    As tabs are completed, the UI is updated to indicate progress
 *    and downstream tabs are enabled as appropriate.
 * 
 *    The last tab in the set is treated specially, assumed to be
 *    a "Review & Submit" tab.
 * 
 *    The parent form is responsible for providing validation and
 *    integrating with the tabflow controller (see below).
 * 
 * 
 *      +
 *      +  +  +  "Continue" (ie Next Tab) Buttons  +  +  +
 *      +
 *    Forms can supply a 'next'/'continue' button on some or all tabs
 *    by adding the class 'tab-submit' to the button.  The tabflow
 *    controller will handle these with a call to 
 *    tabflowcontroller.advance(), which will take the user to 
 *    the "logical next tab", which may or may not be the literal
 *    next tab, depending on circumstances.  See the documentation for 
 *    advance() for details.
 * 
 *    
 * 
 *      +
 *      +  +  +  Tabs/form/validation integration  +  +  +
 *      +
 *    Tabs must be identitied with id of form "tab-x" where x is the 
 *     number of the tab, in order.
 *    There are three situations in which this plugin needs to interact
 *    with the form:
 *    1. Data entry - tabs are enabled/disabled according to the 
 *       validation state of the form.  Although actual navigation 
 *       between tabs is handled separately (see below), we update the
 *       UI in order to provide visual cues as to the state of the form
 *       (eg., placing a checkmark on completed tabs).
 *       After any event which alters the parent form's validation status, 
 *       the forms's controller must:
 *        + set tab validation state(s) by calling 
 *          TabFlowController.setTabValidation()
 *        + call TabFlowController.updateTabs()
 *    2. Tab navigation attempt - the user must be allowed to attempt
 *       to navigate away from the current tab, otherwise there's
 *       no graceful way to trigger validation messaging (he/she would 
 *       potentially be stuck on a tab, not knowing why; or, the form
 *       would need to display error messages even when logically no 
 *       error has ocurred because the user hasn't finished entering 
 *       data).
 *       Because of this, when a user attempts to switch tabs, we don't
 *       know if the switch is actually allowable.  We need to prompt 
 *       the form to run its validation logic, handle the navigation
 *       request accordingly, and notify the form controller if a failure
 *       occurred.  The flow goes like this:
 *        + on nav request
 *           + raises validatenotify.tabflow
 *             Parent form should:
 *              + run validation logic
 *              + set tab validation state(s) by calling 
 *                TabFlowController.setTabValidation()
 *           + on validation failure
 *              + raises tabswitchfailed.tabflow
 *                Parent form should:
 *                 + display appropriate error messaging
 *    3. Tab navigation completed - the user has successfully navigated
 *       to a new tab.  We give the parent form a chance to update the UI:
 *        + (in our handler for the jquery.tabs plugin's tabsshow event)
 *           + raise tabpreshow.tabflow
 *       
 * 
 *   +++++++++++++++++++++++++++++++++++++++++++++++++++++  */

TabFlowController = function( parent, initParams ){
  
  // parent FormsController object
  this.parent = parent;

  this.state = {};

  // Support jQuery UI versions 1.8, 1.9, 1.10
  var jquiver = jQuery.ui.version.match('^([0-9]+)\.([0-9]+)(|\.(.*))$');
  this.state.jquiVersion = null;
  if(jquiver) {
    this.state.jquiVersion = {major: jquiver[1], minor: jquiver[2]};
  }
  var validVer;
  validVer = ! (this.state.jquiVersion == null);
  validVer = (validVer) && this.state.jquiVersion.major == '1';
  validVer = (validVer) && (jQuery.inArray(this.state.jquiVersion.minor, ['8', '9', '10']) >= 0);
  if(!validVer) {
    throw new UserException("flowTabs plugin requires jQuery UI version 1.8, 1.9 or 1.10");
  } 


  /**
   * store client initialization parameters
   *   + selector: jQuery selector for tab element
   *   + validateNotify: handler for validatenotify event
   */
  params: {}
  
  this.params = initParams;
  
  var selector = this.params.selector;

  // manually control validation logic
  this.parent.customOnValidate = this.customOnValidate;

  // integrate with Validation plugin, if it exists
  if( parent.formSettings.plugins[ 'Validation' ] ) {

    validationSettings = {
      customOnValidate: this.customOnValidate
    }

    // Note: we have to consider two possible logic flows depending upon whether or not the 
    //       validation plugin has or has not been instantiated.
    if( parent.plugins.Validation ) {
      // plugin already instantiated, so modify its settings directly
      parent.plugins.Validation.applySettings( validationSettings );

    }
    else if( parent.formSettings.pluginSettings[ 'Validation' ] ) {
      parent.formSettings.pluginSettings[ 'Validation' ].customOnValidate = this.customOnValidate;
    }
  }



  // manually control error suppression
  //this.parent.customErrorMessaging = this.preRefreshForm;
  jQuery( parent.plugins.Validation ).bind( 'preValidateForm' , this.preRefreshForm );

  // manually control error messaging display
  if( this.parent.plugins.Validation ) {
    this.parent.plugins.Validation.customErrorMessaging = this.customErrorMessaging;
  }


  // hook FormController::preUpdateUI event
  jQuery( parent ).bind( 'preUpdateUI' , this.preUpdateUI );

  // stash self in elm.data
  jQuery( selector ).data('flowTabs', this);

  // initialize jquery tabs plugin
  if(this.jQueryUIVersion('-1.8')) {
    var tabsElm = jQuery( selector ).tabs();
  } else {
    var tabsElm = jQuery( selector ).tabs({ active: 0 });
  }

  // @TODO-onstance: make this option configurable
  tabsElm.tabs( "option", "fx", { opacity: 'toggle' } ); 

  // Use jQuery's event.data api to pass reference to parent
  //  object to event handlers

  // add handler for tabsshow event (on select tab, manually set 'touched' flag 
  //  which otherwise would never happen).
  jQuery( selector ).bind( "tabsactivate", {tabsController:this} , function(event, ui){
    event.data.tabsController.processTabShow(event, ui); 
  } )

  // add validation check to tab selection event
  //  if current tab doesn't validate, return False to prevent change
  //  and keep user on current tab
  jQuery( selector ).on('tabsbeforeactivate', {tabsController:this} , this.processTabSwitch);

  // client-specified validateNotify event handler
  if( this.params.validateNotify ) {
    jQuery( selector ).bind('validatenotify.tabflow', this.params.validateNotify );
  }

  // client-specified tabSwitchFailed event handler
  if( this.params.tabSwitchFailed ) {
    jQuery( selector ).bind('tabswitchfailed.tabflow', this.params.tabSwitchFailed );
  }

  // client-specified tabPreShow event handler
  if( this.params.tabPreShow ) {
    jQuery( selector ).bind('tabpreshow.tabflow', this.params.tabPreShow );
  }
  

  // add click handler to "next" buttons
  jQuery('.tab-submit').bind('click', {parent:this}, function(e){
    e.data.parent.advance();
  });
  
  // initialize tab states
  this.tabStates = new TabFlowController.TabStates();
  var tabsCt = jQuery(tabsElm.data('ui-tabs')._getList().children('li')).length;
  for( var idx = 1; idx <= tabsCt ; idx++){

    var tab = new TabFlowController.Tab();
    this.tabStates[idx] = tab;

  } ;
  this.tabStates[1].enabled = true;

}

/**
 * Determine if jQuery UI version matches or is within a range
 * param tag: version number or range.
 *            Supply BOTH major/minor, and ONLY major minor
 *            Usage examples: 
 *             + '1.8'
 *             + '1.9'
 *             + '-1.10' (less than or equal to 1.9 (actually, 1.10.99999...))
 *             + '1.9-' (greater than or equal to 1.9)
 *             + '1.9-1.10' (greater than or equal to 1.9, and less than or equal to 1.10.999...)
 */
TabFlowController.prototype.jQueryUIVersion = function(tag) {
  var regex = '^(-|)(([0-9]+)\.([0-9]+))(-|)(([0-9]+)\.([0-9]+)|)'
  var parsedTag = tag.match(regex)   ;    
  var testVer, lowVer, highVer;

  padDigits = function(number, digits) {
    return Array(Math.max(digits - String(number).length + 1, 0)).join(0) + number;
  }

  // Has leading '-', eg. -x.y
  if(parsedTag[1]) { 
    lowVer = 0;
    highVer = parseFloat(parsedTag[3] + '.' + padDigits(parsedTag[4], 4));
  // Has separating or trailing '-', eg. x1.y1-x2.y2 or x.y-
  } else if (parsedTag[5]) {
    lowVer = parseFloat(parsedTag[3] + '.' + padDigits(parsedTag[4], 4));
    // Has end tag specified
    if(parsedTag[6]) {
      highVer = parseFloat(parsedTag[7] + '.' + padDigits(parsedTag[8], 4));
    // No end tag specified
    } else {
      highVer = 99999.9999;
    }
  // Is single value
  } else {
    lowVer = highVer = parseFloat(parsedTag[3] + '.' + padDigits(parsedTag[4], 4));
  }

  testVer = parseFloat(this.state.jquiVersion.major + '.' + padDigits(this.state.jquiVersion.minor, 4));

  var isValid = (testVer >= lowVer) && (testVer <= highVer);
  isValid = isValid && (testVer >= lowVer) && (testVer <= highVer);
  return isValid;
}











/*
 * Tab state "class" - more a complex data type, really
 */
TabFlowController.Tab = function(){
  
  /* 
   * a tab is 'touched' when user first views it
   * This allows for leaving tabs appropriately
   * enabled when user moves among the tabs outside
   * the sequential order
   */
  this.touched = false;
  
  /**
   * A tab is 'submitted' when user attempts to
   * move to another tab.  This flag allows for suppressing error
   * messaging until user has 'completed' a tab.
   * When user attempts to switch tabs, the current
   * tab's 'moved-off' state is set to 'true'
  */
  this.submitted = false;
  
  /*
   * A tab is 'validated' when all fields on that
   * tab pass validation
   */
  this.validated = false;
  
  /*
   * A tab is 'enabled' when user can choose to 
   * navigate to it.  A tab that has never been
   * touched becomes enabled when the upstream tab
   * is valid.  Once a tab has been touched, it 
   * remains enabled
   */
  this.enabled = false;
  
}

/**
 * Helper class to manage tab states. 
 * Add tab items directly to this object, keyed incrementally starting
 * at 1 (the underlying purpose at this point is to allow 1-based indexing for 
 * readability in the code); 
 */
TabFlowController.TabStates = function TabStates() {
  
  /**
   * add tab items directly to this object; key incrementally,
   * starting at 1, eg: tabStates.1 = {tabObj}
   */
  // this.1 = ? ; this.2 = ? ; ...
  
  /**
   * return count of tabs
   */
  this.count = function(){ctr=1;while(this[ctr]){ctr++};return ctr-1;}
  
  /**
   * set a tab's validation state
   */
  
};


/**
 * implements FormController::customOnValidate
 * @param  {FormController} formController 
 * @return {none}
 */
TabFlowController.prototype.customOnValidate = function( formController ) {

  // refs for readability
  var tabStates = formController.plugins[ 'FlowTabs' ];
  var validator = formController.plugins[ 'Validation' ];

  // validate tabs 1 - (count-1) (ie., ignore last(review) tab)
  for ( var tabIdx = 1 ; tabIdx < tabStates.count() ; tabIdx++ ){
    // validate tab & update tabs controller
    tabStates.setTabValidation( tabIdx , validator.validateGroup ( 'tab-' + tabIdx ) );
  }

}

/**
 * implements FormController::customErrorMessaging
 * @param  {FormController} formController 
 * @return {map object} 
 *              showFormMsg: {bool} ,
 *              suppressFormMsg: {bool} 
 */
TabFlowController.prototype.customErrorMessaging = function( formController ) {

  // Form-level: Only display the form-level message if error(s) on the current 
  // tab.  Since we don't allow switching of a tab that doesn't 
  // validate, this in theory never happens.  But, this is a
  // simple way of handling downstream tabs the user hasn't touched.
  // Note form message is handled after validation, in order to prevent
  //  on/off flashing of message (which causes form elms to shift up/down)
  showFormMsg = false // default  
  suppressFormMsg = true; // default
  var formCtrlr = this._parent;
  var validationCtrlr = this._parent.plugins[ 'Validation' ];
  var flowTabsCtrlr = this._parent.plugins[ 'FlowTabs' ];
  if( 
      ! flowTabsCtrlr.tabStateObj().validated  // this tab has errors

       &&
      ! validationCtrlr.state._suppressErrors // global suppression not on

       &&
      flowTabsCtrlr.tabStateObj().submitted // this tab has been submitted
  ) {
    showFormMsg = true; 
    suppressFormMsg = false;
  }
   
  // show only field messages for this tab   
  var curTabIdx = flowTabsCtrlr.currentTab();
  fldMsgsConfig = false; // default to show no fld-level messges
  if ( 

    ! validationCtrlr.state._suppressErrors 

     && 
    flowTabsCtrlr.tabStateObj().submitted 
  ) {
    fldMsgsConfig = {
      showGroups: [ 'tab-' + curTabIdx ]
    };
  }

  validationCtrlr.updateDisplay( fldMsgsConfig , suppressFormMsg );

  return { showFormMsg: showFormMsg , suppressFormMsg: suppressFormMsg };
}


/**
 * event handler for  FormController::preUpdateUI
 * @param  {FormController} formController 
 * @return {[type]}        [description]
 */
TabFlowController.prototype.preUpdateUI = function() {

  this.plugins[ 'FlowTabs' ].updateTabs();

}

TabFlowController.prototype.count = function(){
  return this.tabStates.count(); // adjust for the 0-idx item
}

/**
 * Event handler for FormController::preRefreshForm 
 * @return {[type]} [description]
 */
TabFlowController.prototype.preRefreshForm = function() {
  // debugger;
  // override default handling of error messages
  this.state._suppressErrors = false;

}

/**
 * Set validation status for a tab
 */
TabFlowController.prototype.setTabValidation = function( tabIdx, isValid ){
  this.tabStates[tabIdx].validated = isValid;
}

/*
 * retrieve tab state object
 * @param tabIdx: {void} retrieves current tab
 */
TabFlowController.prototype.tabStateObj = function( tabIdx ) {
  if( tabIdx === undefined ) tabIdx = this.currentTab();
  return this.tabStates[ tabIdx ];
}


/*
 * get current tab
 */
TabFlowController.prototype.currentTab = function() {
  return jQuery(this.params.selector).tabs( 'option' , 'active' ) + 1;
}


/*
 * Update tab states
 *  Also, set 'checked' class
 * (Presumes validation has been run)
 */
TabFlowController.prototype.updateTabs = function() {

  // grab the state objs for efficiency
  var tabState = this.tabStates;

  var tabCt = this.tabStates.count();
 
  // get current tab
  var activeTabIdx = this.currentTab();
  // determine enable/disable states (determines if user can (attempt to) navigate to tab)
  //   Data Entry tabs
  for( var tabIdx = 1 ; tabIdx <= tabCt ; tabIdx++ ) {
    // tab is enabled if (any of):
    //  + it's (been) touched
    //  + it validates
    //  + its upstream tab is valid 
    //  + its upstream tab is current (so user can click and trigger validation to run;
    //        otherwise, user could have trouble figuring out how to proceed)
    if( tabState[ tabIdx ].touched || tabState[ tabIdx ].validated) {
      tabState[ tabIdx ].enabled = true;
    } else if ( tabIdx > 1 ) {     
      tabState[ tabIdx ].enabled = ( 
        tabState[ tabIdx - 1 ].validated
         ||
        tabIdx == activeTabIdx + 1
      );
    } 
  }
     
  //   Review tab (assuming all data entry tabs validate)
  var dataTabsValidate = true;
  for( var tabIdx = 1 ; tabIdx < tabCt ; tabIdx ++ ) {
    if( ! tabState[ tabIdx ].validated ){
      dataTabsValidate = false;
      break;
    }
  }
  // if all data entry tabs validate, enable the review tab
  if( dataTabsValidate ) { 
    tabState[ tabCt ].enabled = true;
  }



  // configure tabs
  //  + Add "Done" check marks on tabs that validate
  for( tabIdx = 1 ; tabIdx <= tabCt ; tabIdx ++ ) {
    if( tabState[tabIdx].validated ) {
      jQuery("#tab" + tabIdx + "-inner").addClass( "checked" );    
    } else {    
      jQuery("#tab" + tabIdx + "-inner").removeClass( "checked" );    
    }     
  }

 
  // Apply Enable/disable state to tabs and "Tab Submit" buttons
  for( tabIdx = 1 ; tabIdx <= tabCt ; tabIdx ++ ) {
    tabEnableSetKey = ( tabState[ tabIdx ].enabled ? 'enable' : 'disable' );    
    jQuery(this.params.selector).tabs( tabEnableSetKey , tabIdx - 1 );
  }



  // disable submit (and 'submit on enter') unless on last tab
  var submitSelector = this.parent.formSettings.formSelector + " :submit";
  if( activeTabIdx == tabCt ) {
    // enable submit
    jQuery(submitSelector).removeAttr('disabled'); 
  } else {
    // disable 'submit on enter'
    jQuery(submitSelector).attr('disabled', 'disabled'); 
  }
  
}

/**
 * Handle the "Continue" button for a tab - go to logical next tab.
 * In normal flow this will be the literal next tab.  In cases where
 * the user has gone back in the tab order (to change or review entries, eg),
 * it will be the first not-completed tab, unless all tabs are 
 * completed, in which case the 'next' tab will be the *last* (review) tab.
 */
TabFlowController.prototype.advance = function(){ 
  var curTab = this.currentTab();
  var tabsCt = this.count();
 
  for (var nextTab = curTab + 1 ; nextTab <= tabsCt ; nextTab++ ) {
    if( ! this.tabStates[nextTab].validated || nextTab == tabsCt ) {
      this.activateTab( nextTab );
      break;
    }
  }
   
}

/* 
 * Activate selected tab - show and scroll to top.
 */
TabFlowController.prototype.activateTab = function( idx ) {
  // map 1-based keys to 0-based
  idx = parseInt(idx);
  idx = idx - 1;

  // tabs('select') will cause the processTabSwitch logic to fire, and
  // the 'select' action will fail if it's not valid.
  jQuery(this.params.selector).tabs("option", 'active', idx ); 
  jQuery('html').scrollTop(  jQuery(this.params.selector).offset().top  );
  
}

/*
 * Handle tab switch event (at request time, before it completes)
 * If current tab doesn't validate, don't allow the switch
 *  (by returning False)
 */
TabFlowController.prototype.processTabSwitch = function(event, ui) {
console.log({processTabSwitch: [event, ui]});
  // Note: because this is a DOM event handler, the 'this' keyword here
  // points to the DOM element from which the event originated, NOT
  // the parent js 'tabsController' instance.  So, we're passing in
  // the correct reference via jquery's bind() facility
  _this = event.data.tabsController;
 
  // get current (ie. before switch) tab 
  curTab = _this.currentTab();
  
  // always allow switch from last tab (review)
  if( curTab == _this.count() ) return true;

  // update current tab's state
  tabState = _this.tabStateObj( curTab );
  
  // set current tab's 'submitted' state
  _this.tabStateObj().submitted = true;
  
  // raise validatenotify event so client form can update validation
  // states
  jQuery(_this.params.selector).trigger('validatenotify.tabflow');
  
  // if errors on tab, notify client and disallow tab change
  if( ! _this.tabStateObj( curTab ).validated ) {

    // raise event notifying client of failed tab change
    jQuery(_this.params.selector).trigger('tabswitchfailed.tabflow');
    
    // cancel tab change (per jquery.tabs api)
    return false;
  }
  
  return true;
  
}

/*
 * Handle tab show (switched to) event 
 *  + Manually set 'touched' flag
 *  + If this is the Review tab
 *     + set its validation flag to true
 *     + trigger update event to allow client to respond
 *        // updateDynamicElements (to handle some edge cases)
 *  + Trigger updateTabs() (sets the 'checked' class)
 *  + Set focus to first field 
 * 
 *  Note: validation has implicitly already been performed
 *   and passed, otherwise the switch action/event wouldn't have been 
 *   allowed to complete
 */
TabFlowController.prototype.processTabShow = function(event, ui) {
  
  var _this = event.data.tabsController;
  var tabsCt = _this.tabStates.count();
  
  var curTabIdx = jQuery(this.params.selector).tabs("option","selected") + 1;

  // set 'touched' state
  _this.tabStates[ curTabIdx ].touched = true;
  
  // review tab is only, but always, "valid" if it's the current tab
  _this.tabStates[ tabsCt ].validated = ( curTabIdx == tabsCt ) ;
  
  // raise pre-show event so client can update form if necessary
  jQuery(_this.params.selector).trigger('tabpreshow.tabflow');
  
  // update tabs UI
  _this.updateTabs();
  
  // put focus in first field 
  jQuery(jQuery('#tabs-' + curTabIdx + ' input:not(:hidden, [type=button], [type=submit]) , #tabs-' + curTabIdx + ' select')[0]).focus();
  
}

