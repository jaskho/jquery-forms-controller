# Overview

This project is really three projects in one:

1. FormsController - Light-weight, modular application framework, implemented as a jQuery plugin.  Provides centralized event handling, state management and display updating, with a pluggable architecture for the integration of additional functional components.


2. Validation module - Flexible input control, validation and feedback messaging framework, implemented as a FormsController plugin (and, incidentally, as a jQuery plugin).  Supports arbitrarily complex validation and prompting/signaling scenarios (see below).

The FormsController and Validation module together provide for a flexible, roughly MVC-style, form-based interface.


3. FlowTabs widget - jQuery widget for implementing a multi-step process via a tabbed display.

Together with the FormsController/Validation module, allows a complex form to be presented as a managed-sequence, wizard-style process, using a tabs metaphor to provide user feedback and orientation.


(As an aside, although the Validation and FlowTabs modules have been implemented as FormsController plugins, decoupling one or both into standalone jQuery plugins would be relatively trivial.)




# Form Controller jQuery Plugin


## Framework Logic

The FormController centralizes and organizes the processing of user actions and the application's responses to those actions, as delegated to/determined by component modules.  

By default, processing follows these steps, in order:
+ Event capture and delegation: ::refreshForm(). 
+ State Management: ::customOnChange().  Component modules transform model data in response to the event.
+ Validation/business logic.  ::validateForm().  Component modules evaluate new application state and register necessary responses.
+ UI Update.  ::updateDynamicElements() & ::customUpdateUI().  All UI changes are performed here.

## Event Capturing

FormController's default behavior is to capture the following form events (addressed by jQuery selectors):

    change: [ "input" , "select"  ] ,
    click:  [ '[type="button"]' , '.user-action' ]
    
This can be overridden or extended by component modules, using <code>settings.updateSelector</code>.
The set of elements can also be restricted, using <code>settings.updateNotSelector</code>.
Note the use of the class attribute <code>"user-action"</code>.  This essentially converts any link with <code>class="user-action"</code> into a button.


#Validation Plugin
FormsController plugin for validation, input masking and error messaging/signalling.
 
Extensible configuration API allows for user-defined features such as
+ re-usable validation and input masking rules.
+ regex-based validation rules.
+ regex-based input masks.
+ complex/conditional/multi-element validation (e.g. if field A is empty, fields B, C and D must not be empty)
+ nested validation elements (e.g., if a field is a member of widget on a tab, validation can be
  applied independently to the field, the widget and/or the tab.)
+ dynamic, fine-grained control of validation code execution (ie. when Tab A is active, don't bother to
  validate Tab B, but when Tab B is active, validate both Tab A and Tab B.)
+ fine-grained control of error messaging/signalling.
+ custom validation and messaging callbacks.

##Usage
+ Requires FormsController framework plugin.
+ Include the validation.2.0.js script
+ Declare the plugin by adding it to the FormController's Plugins object:
  <code>formController.settings.plugins.Validation = UIValidation</code>
  (see example implementation formControllerExample.js)
+ Define validation rules in the FormController's pluginSettings object:
  <code>formController.settings.pluginSettings.Validation = {}</code>
  (see Validation UI API below as well as example implementation formControllerExample.js)<br/>
  Note: all settings can be modified at run-time

##Validation UI API
Error messages and display specs are declared in the parent FormController's config object:

    formContoroller.settings.pluginSettings.Validation.validationFormSettings: {}

###Members
+ <code>validationFormSettings</code><br/>
  Global settings
  + <code>formMsgSelector</code><br/>
    jQuery selector.  Form-level messages will be inserted into
    this element
  + <code>formMessage</code><br/>
    Default form-level validation message
  + <code>formMessageFadeIn</code><br/>
    Time, in milliseconds, for message fade-in effect
  + <code>formMessageFlashInterval</code><br/>
    Time, in milliseconds, for form-level message flash effect (useful for situations where the message is being re-displayed, ie. after a user unsuccessfully attempts to correct a data entry error)
  + <code>formMessageFlashColor</code><br/>
    Color for flash effect<br/>
    @TODO: refactor to use a classname, with color spec'd in css
  + <code>interceptSubmission</code><br/>
    Prevent automatic form submission
+ <code>validationFields</code><br/>
  Object map of user-defined validation items (see below)
+ <code>validationFormats</code><br/>
  Object map of user-defined validation/masking rules (see below)

###Field definitions
Define a field by adding a config object to the 
<code>validationFormSettings.validationFields</code> map:

    validationFields.yourFieldKey: {}

(See example implementation for more information)<br/>


####Members
+   <code>groups</code><br/>
     Array of arbitrary labels for grouping fields. All fields with <code>foo</code> in
     their <code>groups</code> array will be validated whenever the group
     <code>foo</code> is validated.
+   <code>skip</code><br/>
     If true, field will not be validated
     This can be set at validation time to allow for contextual processing
+   <code>custom</code><br/>
     If true:
     + field will not be automatically validated, but must be
       handled manually by the application
     + If validation status is registered (by app, via <code>validateCustomItem()</code>),
       will be processed in normal UI messaging flow
+   <code>validation</code>
   +   <code>required</code><br/>
         (optional)<br/>
         @TODO: document this feature
   +   <code>validation.msg</code>
         + message to be displayed with the field(s)
   +   <code>validation.errorElmSelector</code>
         + (optional - ie., n/a in case of multi-field validation )
           REQUIRED if no msgElmSelector or msgAfterElmSelector is provided
         + jquery style selector
         + gives the actual error element
   +   <code>validation.msgElmSelector</code>
         + (optional - see below)
         + jquery-style selector.  
         + If supplied, error message will
           be displayed in this DOM elm
   +   <code>validation.msgAfterElmSelector</code>
         + (optional - see below)
         + jquery-style selector.  
         + If supplied, error message will
           be displayed in a new DOM element inserted after the selected elm
   +   <code>validation.format</code>
         + (optional)
         + Applies
            + input mask
            + regex validation
         + Current options:
            + "phone"
            + "numeric"
            + "zipcode"

#### Message display logic
+ If <code>msgElmSelector</code> is supplied, then
  + message will be inserted in the given element
+ Otherwise:
  + If <code>msgAfterElmSelector</code> is supplied, then:
     + a new DOM element will be added as first-sibling after the given element
     + message will be inserted in the new element
  + Otherwise:
     + a new DOM element will be added as first-sibling after the  element given by <code>errorElmSelector</code>
     + message will be inserted in the new element

###Custom Validation Rules & Input Masks
Define a validation/masking rule by adding a config object to 
<code>validationFormSettings.validationFormats</code> map:

    validationFormats.yourFormatKey: {}

(See example implementation for more information)<br/>

Keys
+ <code>keyMask</code><br/>
  Regex defining valid entries
+ <code>inputRule</code><br/>
  Regex defining valid keystrokes

Built-in formats:
+ phone
+ numeric
+ zipcode


###Groups


###Custom Validation Functions
Custom validation functions can be attached to fields and groups.  UIValidation::customValidators
Set of custom group and field validator functions.
Whenever a function is supplied matching a group key or
field id, it will be used instead of the default logic.
Notes: 
  + UIValidation will wrap supplied functions in a closure
    supplying a reference the the parent UIValidation object
    via <validator>.
  + Custom group validators can "inherit" default group validation
    logic by recursing into validator.validateGroup(), setting
    param applyDefaults to TRUE:
   
###API Functions
+ customValidators

###Utility Functions
+ fieldsAreEmpty 
+ groupIsEmpty  
+ skipGroupFields
+ validateCustomItem
+ validateGroup


Client may add these via a script extending this
class.  Implement UIValidation.prototype.customValidators() and assign
validation functions to 
 + this.config.validators.groups <br/>
   (map object keyed by group keys)
 + this.config.validators.fields<br/>
   (map object keyed by field ids)



