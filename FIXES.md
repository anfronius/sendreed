# Fixes to Deploy after Original Formation

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