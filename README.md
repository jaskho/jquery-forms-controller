# Form Controller jQuery Plugin

Provides a framework for presenting interactive forms, with flexible validatation, 
event management and user messaging.

## Framework Logic

The FormController centralizes and organizes the processing of user interactions.  By default, actions proceed through these steps, in order:
+ Event capture and delegation: ::refreshForm(). 
+ State Management: ::customOnChange().  All necessary changes to the data (not UI) state are performed.
+ Validation.  ::validateForm().  Evaluates entries per default and custom rules
+ UI Update.  ::updateDynamicElements() & customUpdateUI().  All UI changes are performed here.

## Event Capturing

FormController's default behavior is to capture the following form events (addressed by jQuery selectors):

    change: [ "input" , "select"  ] ,
    click:  [ '[type="button"]' , '.user-action' ]
    
This can be overridden or extended by client, using <code>settings.updateSelector</code>.
The set of elements can also be restricted, using <code>settings.updateNotSelector</code>.
Note the class <code>"user-action"</code>.  This essentially converts any link with <code>class="user-action"</code> into a button.


##Validation UI API
Error messages and display specs are declared in config objects, keyed by "field" :
    formElement.config.fields.{fieldkey}.validation
(note that in this context a "field" could refer to an html form element or a logical
compounded of elements).

Validation configuration can be modified at run-time.

### Configuration Object properties:
   +   groups
         Array of arbitrary labels for grouping fields
   +   skip
         If true, field will not be validated
         This can be set at processing time to allow for contextual processing
   +   custom
         If true:
         + field will not be automatically validated, but must be
           handled manually by the application
         + If validation status is registered (by app, via validateCustomItem()),
           will be processed in normal UI messaging flow
   +   validation
       +   required
             (optional)
             @TODO-ONSTANCE: document this feature
       +   validation.msg
             + message to be displayed with the field(s)
       +   validation.errorElmSelector:
             + (optional - ie., n/a in case of multi-field validation )
               REQUIRED if no msgElmSelector or msgAfterElmSelector is provided
             + jquery style selector
             + gives the actual error element
       +   validation.msgElmSelector
             + (optional - see below)
             + jquery-style selector.  
             + If supplied, error message will
               be displayed in this DOM elm
       +   validation.msgAfterElmSelector: ".form-item-agreement" ,
             + (optional - see below)
             + jquery-style selector.  
             + If supplied, error message will
               be displayed in a new DOM element inserted after the selected elm
       +   validation.format
             + (optional)
             + Applies
                + input mask
                + regex validation
             + Current options:
                + "phone"
                + "numeric"
                + "zipcode"
                
### Message display logic
+ if .msgElmSelector is supplied, message will be inserted in the given elm
+ If .msgElmSelector is NOT supplied, then:
  + If .msgAfterElmSelector is supplied then
     + a new DOM element will be added as first-sibling after the given elm
     + msg will be inserted in the new elm
  + If .msgAfterElmSelector is not supplied, then
     + a new DOM element will be added as first-sibling after the elm given by .errorElmSelector
     + msg will be inserted in the new elm
