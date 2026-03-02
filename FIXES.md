# Fixes to Deploy after Original Formation

## First Set of Fixes (FINISHED)

### Dashboard Page
- *Admin View* Should show Users and their stats (like contacts, templates, campagisn, etc) instead of just the total amount of those stats from all users.
- *Admin View* Remove the "Quick Actions' and 'Admin' tools sets, which include buttons for 'New Campaign', 'View Contacts', 'Import CSV', and 'Manage Users' as they are redundant and do not save much time at all. Note that I only want the 'Quick Actions' gone for Admins and not All Users.

### Contacts Page
- *Admin View* The main contact page for Admins should have at the top underneath the 'Contacts' title a dropdown / selection of all Users, and allow for a singular User's contacts to be listed at a time as they do not all share the same category fields and can get crowded with several users.
- *All Users* The sort-by dropdown should instead be a menu which allows for sorting by Missing Phone or Email, and by Name / City / State / Address alphabetical orders. 
- *ALL USERS* The search should not just search the names or whatever of contacts but allow for search of all available fields including City, Phone Number, etc
- *ALL USERS* When a field is empty on a listed contact, there should be more of a visual indicator of where to click (and larger button to click) to input the information manually.
- *ALL USERS* Instead of an 'Actions' field at the end with an individual 'Delete' button for each listed contact, there should instead just be a checkbox at the very beggining of each contact which can be checked (also allowing multiple contacts to be selected at a time) and a single 'delete' button at the top which can be used to delete multiple contacts at once.
- *ALL USERS* The small number next to the 'Contacts' title which represents the amount of contacts available should have a more pronounced space and seem less like a small weird mistaken artifact.

### Campaigns Page
- *ALL USERS* Similar to the 'Contacts' page, I want the small number that represents the amount of campaigns available to be more pronounced and less of a weird small artifact.
- *Admin View* Like the admin version of the 'Contacts' page, there should be a dropdown / selection of Users so they can choose a singular one and view their campaigns or create new ones with that User's tailored data.
- *ALL USERS* On the template select, there should be an ability to edit the details of the template.
- *ALL USERS* There should be a list of available templates on the base 'Campaigns' page.

### Real Estate Page
- *Real Estate and Admin View* In the Realist Lookup subpage, for each address there should be a checkbox at the start, like what needs to be added to the 'Contacts' page, for a delete functionality but also for the 'Not Found' button.
- *Real Estate and Admin View* The field which is called 'City / State / Zip' cirrently only shows the initials for the city the address is located as of now. A system must be built which translates these abbreviated names to their full city names.
- *Real Estate and Admin View* The 'Address' field currently only has the Street Name and not the Street Number appended to the front as it should. 
- Instead of 'Sale Date' and 'Sale Price', name those fields 'Close Date' and 'Close Price.
- *Real Estate and Admin View* On the 'Import vCard' subpage on my IPhone when I click on the 'Choose File' button it asks the User to grab a file from their Documents of Files storage, but it should ask for permission to access the User's contacts and and download them itself instead.
- *ALL USERS* The 'Holidays' subpage honestly doesn't serve much of a purpose, and should be removed.

### Admin Page
- *Admin View* This should just be removed altogether as there is no use for this that the dashboard doesn't already provide.

### Users Page
- *Admin View* For existing users, there should be more stats than just the 'Created' field and allow for for a separate 'Wipe Data' button that doesn't delete the User but removes all their associated data (the Delete button should do this too but also remove the User entirely).

## Second Set of Fixes

### Real Estate Page — Quick Wins (DONE)
- [x] *Real Estate and Admin View* Add a similar but not too expansive list of Anniversaries on the main Real Estate Page similar to the dedicated Anniversaries page that can be clicked on to get to the anniversaries page instead of the Anniversaries button.
- [x] *Real Estate and Admin View* Currently when copying an address via the Copy button the the realist lookup page, it copies the address including the leading number if it is apart of a unit, which shows up with 3 spaces between the main address name like '10755 MAGNOLIA AVE' and the unit like '#103' '10755 MAGNOLIA AVE   #103' instead of how it appears on the my sendreed realist lookup page '10755 MAGNOLIA AVE #103'. What I want is for the copy button to instead copy the address like this '10755 MAGNOLIA AVE # 103, Anaheim, CA' with the city, like in this case, 'Anaheim' also being copied exaclty like (make sure to include abbreviated CA too).
- [x] The City field on the realist lookup page STILL says City / State / Zip when its just the City. PLease remove the State and Zip portions

### Admin-as-Supervisor Rework (DONE)
- [x] An admin GUI which allows them to add or edit or delete the many DB fields that aren't being used or that are needed around the website like for the clients and properties. I only want as many fields that have the possibility of being used to be shown essentially.
- [x] I want total separation of the type of clients. When I add new clients, it should very specifically specify whether these are for which account, as that determines which fileds that can possibly be attributed to that client or db object in general
- [x] Before any action of adding or doing anything, it should know for which user I am performing this action for. The admin themself should not have clients or properties or anything as it is just a supervisory role. Whne an admin adds clients, they must be adding them to an existing account and the properties associated must follow the properties of the real estate or non profit client types.
- [x] The same above also applies to the templates and campaigns. The admin has no templaate or campaigns and when an admin makes a template or institutes a campaign, it MUST be attributed to an existing user of either real estate or nonprofit type.

### Anniversary Digest Config (DONE)
- [x] The smtp config for admin in the users section should stay as I want you to create a section in the annniversaries page that allows the admin to enable, disable, or change the parameter of days on how close to an anniversary it must be for the anniversary digests to be sent to a real estate user. The emails come from the admin's setup email (in this case please add protonmail as en email option as the admin uses protonmail). This setting should be able to be set on or off and days changed per real estate user.

### General — Quick Wins (DONE)
- [x] The color of buttons in general are very confusing. Lets simplify that with a more unified button color system. For button that lead to pages that allow upload, make them orange. For buttons that take you to normal menus like realist lookup or anniversaries, have them the same grayish blue that they are now. For when there is a list of buttons of which one can be selected at a time, have them be the same blue that they already are, like the realist lookup page's All, Pending, Found, Not Found button system. This is mainly targetting weird random button color choices like one the quick actions portion of the Real Estate Where Import CRMLS CSV is brighr blue but the Import Contact button is the same blue gray as the other buttons that take you to menus.
- [x] For the real estate user, the Import CSV quick action should instead be a Manage CRMLS Data which takes you to the main Real Estate Page

### Template Editing + Scheduled Sends (DONE)
- [x] There should be an ability to fully view and edit the created templates on the campaigns page where you pick one, and the template should have an ability to be associated with a date, to create holiday templates like for Christmas and such and to have it automatically sent out on that day.

### Contacts — Quick Wins (DONE)
- [x] There now a sort option for Name, City, Name Address, but there is no sort by option like to sort alphabetically A to Z or Z to A


## Third Set of Fixes (DONE)

- [x] the route for the crmls import shouldn't just be /import, it should be /import-crmls or whatever the template has. Can you please change that if possible
- [x] can you make it so at the top banner where it has the Dashboard, Contacts, Campgaigns, and Real Estate page links, can you make it so real estate users see the Contacts link as a Clients instead and reference clients instead too in that pasge for real estate users?
- [x] the admin for some reason cannot see the imported contacts from the vCard and only the actual account can, even if the admin selects the account with the imported contacts on the admin banner and refreshes the page. Can you investigaate and fix that?

### 4th Set (DONE)

- the specific requests are lost to a rollback, but the plan to deal with them (which is all that is needed to know what the issues were in this set) are in '~/.claude/plans/playful-cuddling-waffle.md'
- [x] Fix 1: Anniversary digest toggle — RE users can now toggle their own digest on/off
- [x] Fix 2: Apply All Confirmed now uses AJAX without page refresh
- [x] Fix 3: Phone matching page button sizing equalized
- [x] Fix 5: Templates channel restriction removed (done previously)
- [x] Fix 6: Phone matching UI reversed — existing contacts are primary, vCard imports are the source
- [x] Fix 7: Campaign delete action from history page
- [x] Fix 8: Template list scrolls with fade gradient after 5+ items
- [x] Fix 4 (SMS in-progress + daily email limit): Deferred - moved to 8th set

### 5th set (DONE)

- [x] When I try to delete templates, or change the fields in the fields tab, a pop up saying "Error: Unexpected token 'I', "Invalid CSRF token" is not valid JSON"" appears.
- [x] the templates still have "channel" designations. Do i need to wipe the db or delete them all to reset that?
- [x] There still shows on the edit template the channel nut it doesnt let me change it. Is that related to the above?
- [x] Ability to create new templaates on the main campagign page so you dont have to go through campaign creation to make a template
- [x] On Users panel for admin, make the SMTP button as wide as the Wipe Data and Delete, and add the same space between the Wipe Data and SMTP buttons as the Wipe Button and Delete buttons have.

### 6th Set (DONE)

- [x] on the newly created 'New Template' modal, there should be the variable  options avilable to click and use in the message/subject like the campaign builder's new template page.
- [x] When I try to build a new template or edit a pre-exiting one with the new 'New Template' modal on the campaigns page, when I try to click the 'Save' button at the bottom after filling out the fileds I get a 'Failed to save: Invalid CSRF token' Errorr
- [x] I still get a 'Failed to save: Invalid CSRF token' error when trying to edit the Fields checkboxes on the Fields page as an admin and when trying to delete templates on the main campaign page. 

### 7th Set (DONE)

- [x] Even though the 'Zip' and 'State' fields are disabled in the fields mangement page, they still show up as an option in the /realestate/import-crmls/upload page when matching the uploaded csv to the needed fields

### 8th Set (DONE)

- [x] When I input a name on the crmls lookup page, (realestate/lookup) it automatically gets "FOUND" on that object but the Finalize Lookup button does not update the amount or aknowledges them until the page is refreshed. Also once property / name matches have been finalized into clients, the adress should dissapear from the realist lookup page, which it is currently not and I can infinitely Finalize their lookup. (I think when I do click on the finalize even the ones that weren't initially recongnized by the button work but the button doesn't dynamically appear and change its count properly, only the actual backend functionality works as intended.)
- [x] The same Apply all confirmed button not dynamically changing with each client being matched with their vcard contact issue is happening on the Phone and email matching page still, and the button is still slightly smaller than the import another vcard button still
- [x] Increase the height of the 'delete selected' button on the Clients/Contacts Page to match the Import CSV.
- [x] Like above, the not found and delete buttons should be taller to be the same height as the Finalize lookup buttoNS. Essentially through the project I wan very unified button sizes. For the main buttons for menus and such they should be the largest and have the same size as the Import CSV button on the CLients page. Then there should be the smaller buttons which are the actions for db objects like delete, edit, view tests, etc which should all the that same small size like the delete and edit button the campaigns page for the templates. Finally the buttons that are there on the realestate/lookup that denote "All, Pending, Found, Not Found" should stay the same size as that fits well for now. Also note this is for the menus on the main pages and doesn't apply to the small rectangular choose file buttons that brings up the file system of the device and the other niche buttons on the actual /campaign/create page.
- [x] On the clients / contacts, have the ability on the "all clients' filter options that also has missing phone and missing email, have options for "has phone" or "has email" too and remove the blue filter button and just have the filter apply automatically when the settings get changed in any way.
- [x] on the campaigns page, for each campaign and their actions, the 'View Text button should be made shorter to conform with the height of the Delete button right next to it and conform with the size of the other delete and edit button underneath.
- [x] Fix 4 from '~/.claude/plans/playful-cuddling-waffle.md'
- [x] There should be a way to reverse the 'Not Found' properties if it was accidently clicked or the client was found later. Also when I click the not found button, it doesnt automatically change the numbers on the "Found, Not FOund" buttons at top, which like I've said many times I want everything to work dynamically and nothing should have to have the page refreshed to work properly, just like this.
- [x] Same button fix is needed for the Users list on the users page, but considering how small the Wipe Data and Delete buttons look on the page, can you make them the same height (taller) as SMTP button instead of formalizing them to the small button standard?
- [x] As admin, when I try to add my protonmail with all the correct credentials (the test succeeds and the connection works) when I actually try to save the credentials I get an error saying "Failed to save SMTP settings."