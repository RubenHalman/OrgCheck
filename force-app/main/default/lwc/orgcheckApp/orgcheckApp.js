import OrgCheckStaticRessource from "@salesforce/resourceUrl/OrgCheck_SR";
import { OrgCheckAPI } from './api/orgcheck-api';
import { loadScript } from 'lightning/platformResourceLoader';
import { LightningElement, api } from 'lwc';

export default class OrgCheckApp extends LightningElement {

    /**
     * {URL} logoURL URL for the logo in the header
     */
    logoURL = OrgCheckStaticRessource + '/img/Logo.svg';

    orgCheckVersion;
    orgName;
    orgType;
    themeForOrgType;
    orgLimit;
    themeForOrgLimit;

    /**
     * {String} userId Salesforce Id of the current user passed by Visual Force page
     *                 This value is decorated by "api" so it can be passed by the parent.
     *                 Indeed the value will be set by the parent (a Visual Force page) and will be used by the Org Check API
     */
    @api userId;

    /** 
     * {String} accessToken Access Token of the current user
     *                      This value is decorated by "api" so it can be passed by the parent.
     *                      Indeed the value will be set by the parent (a Visual Force page) and will be used by the Org Check API
     */
    @api accessToken;

    /**
     * {String} #currentTab The name of the currently selected tab
     *                      This property is private
     */
    #currentTab;

    /**
     * {OrgCheckAPI} #api The OrgCheck api
     */
    #api;

    #hasRenderOnce = false;
    #spinner;
    #filters;

    renderedCallback() {
        if (this.#hasRenderOnce === false && this.accessToken) {
            this.#hasRenderOnce = true;
            this.#spinner = this.template.querySelector('c-orgcheck-spinner');
            this.#filters = this.template.querySelector('c-orgcheck-global-filters');
            this._loadAPI();
        }
    }

    /**
     * After changing the filters value, a button appears on the UI.
     * Event called when the user click on this new button.
     * The idea here is to populate the appropriate data on the current tab
     * This method is async because it awaits for the internal _updateCurrentTab method.
     */
    async handleFiltersValidated() {
        await this._updateCurrentTab();
    }

    /**
     * Event called when user selects a main tab
     * This updates the internal private property called "#currentTab" that represents the name of the tab currently opened/visible.
     * This method is async because it awaits for the internal _updateCurrentTab method.
     * 
     * @param {Event} event triggered when a user is selecting a main tab, thus the current tab will be the current selected sub tab within this main tab.
     */
    async handleTabActivation(event) {
        if (event.target.children.length > 0) {
            await this._updateCurrentTab(event.target.children[0].activeTabValue);
        }
    }

    /**
     * Event called when user selects a sub tab (within a main tab)
     * This updates the internal private property called "#currentTab" that represents the name of the tab currently opened/visible.
     * This method is async because it awaits for the internal _updateCurrentTab method.
     * 
     * @param {Event} event triggered when a user is selecting a sub tab, thus its target is actually the current tab.
     */
    async handleSubTabActivation(event) {
        await this._updateCurrentTab(event.target.value);
    }

    /**
     * Event called when the content of a sub tab is fully loaded
     * This method is async because it awaits for the internal _updateCurrentTab method.
     */
    async handleSubTabContentLoaded() {
        await this._updateCurrentTab();
    }

    /**
     * Method called when the user ask to remove an item or all the cache in the UI
     * 
     * @param {Event} event should contain "allItems" (boolean) and optinally "itemName" (string), if allItems=true 
     *                      all items should be removed, if not, the "itemName" gives us the name if the cache entry
     *                      to be removed.
     */
    async handleRemoveCache(event) {
        if (event.detail.allItems === true) {
            this.#api.removeAllCache();
        } else {
            this.#api.removeCache(event.detail.itemName);
        }
        this._updateCurrentTab();
    }

    _loadAPI() {
        Promise.all([
            loadScript(this, OrgCheckStaticRessource + '/js/jsforce.js')
        ]).then(() => {
            this.#api = new OrgCheckAPI(
                // eslint-disable-next-line no-undef
                jsforce,
                this.accessToken,
                this.userId,
                {
                    begin: () => { this.dispatchEvent(new CustomEvent('log', { detail: { status: 'begin' } })); },
                    sectionStarts: (s, m) => { this.dispatchEvent(new CustomEvent('log', { detail: { status: 'section-starts', section: s, message: m } })); },
                    sectionContinues: (s, m) => { this.dispatchEvent(new CustomEvent('log', { detail: { status: 'section-in-progress', section: s, message: m } })); },
                    sectionEnded: (s, m) => { this.dispatchEvent(new CustomEvent('log', { detail: { status: 'section-ended', section: s, message: m } })); },
                    sectionFailed: (s, e) => { this.dispatchEvent(new CustomEvent('log', { detail: { status: 'section-failed', section: s, error: e } })); },
                    end: (s, f) => { this.dispatchEvent(new CustomEvent('log', { detail: { status: 'end', nbSuccesses: s, nbFailures: f } })); }
                }
            );
            this.accessToken = ''; // reset the accessToken so we do not store it anymore
            this.orgCheckVersion = this.#api.getVersion();
            this.#api.getOrganizationInformation().then((orgInfo) => {
                this.orgName = orgInfo.name + ' (' + orgInfo.id + ')';
                this.orgType = orgInfo.type;
            }).catch((error) => {
                this.#spinner.sectionFailed('Error while getting information of the org from API', error);
            });
            this.#api.getPackagesTypesAndObjects('*', '*').then((data) => {
                this.#filters.updateSObjectTypeOptions(data.types);
                this.#filters.updatePackageOptions(data.packages);
                this.#filters.updateSObjectApiNameOptions(data.objects);
            }).catch((error) => {
                this.#spinner.sectionFailed('Error while getting filters values from API', error);
            });
        }).catch((error) => {
            this.#spinner.sectionFailed('Error while loading API', error);
        });
    }

    /**
     * Unique method to propagate a change to be done in the current tab.
     * If the given input value is specified, this must be different from the current tab property, otherwise this method does nothing.
     * If the given input value is undefined, the method will use the current tab.
     * This can be because end user selected another tab
     * This can be also becasue a filter was validated and needs to be propagated into the current tab
     * This can be also if the current tab is finally loaded
     * Usage: as this method is async, you should await when calling it!
     * 
     * @param {String} nextCurrentTab Next current tab that will be activated/selected.
     */
    async _updateCurrentTab(nextCurrentTab) {

        // If for some reason the api is not yet loaded, we stop there
        if (!this.#api) return;

        // If the next current tab is the same as the current one, we stop here
        if (nextCurrentTab && nextCurrentTab === this.#currentTab) return;

        // If the next current tab is specified, we use it to reset the current tab property
        if (nextCurrentTab) this.#currentTab = nextCurrentTab;

        // Get the global filter parameters
        const namespace = this.#filters.isSelectedPackageAny === true ? '*' : (this.#filters.isSelectedPackageNo === true ? '' : this.#filters.selectedPackage);
        const sobjectType = this.#filters.isSelectedSObjectTypeAny === true ? '*' : this.#filters.selectedSObjectType;
        const sobject = this.#filters.isSelectedSObjectApiNameAny === true ? '*' : this.#filters.selectedSObjectApiName;

        // Call the API depending on the current tab
        // If not supported we stop there
        // Finally send the data to the content component.
        // All is surrounded by a try catch that will show error modal if any.
        const section = `TAB ${this.#currentTab}`;
        try {
            this.#spinner.open();
            this.#spinner.sectionStarts(section, 'Call the corresponding Org Check API');
            switch (this.#currentTab) {
                case 'object-information':                 if (sobject !== '*') this.objectInformationData = await this.#api.getObject(sobject); else this.objectInformationData = null; break;
                case 'objects-owd':                        this.objectsOWDTableData = await this.#api.getObjectsOWDs(); break;
                case 'custom-fields':                      this.customFieldsTableData = await this.#api.getCustomFields(namespace, sobjectType, sobject); break;
                case 'users':                              this.usersTableData = await this.#api.getActiveUsers(); break;
                case 'profiles':                           this.profilesTableData = await this.#api.getProfiles(namespace); break;
                case 'permission-sets':                    this.permissionSetsTableData = await this.#api.getPermissionSets(namespace); break;
                case 'roles':                              this.rolesTableData = await this.#api.getRoles(); break;
                case 'public-groups':                      this.publicGroupsTableData = await this.#api.getPublicGroups(); break;
                case 'queues':                             this.queuesTableData = await this.#api.getQueues(); break;
                case 'flows':                              this.flowsTableData = await this.#api.getFlows(); break;
                case 'process-builders':                   this.processBuildersTableData = await this.#api.getProcessBuilders(); break;
                case 'workflows':                          this.workflowsTableData = await this.#api.getWorkflows(); break;
                case 'custom-labels':                      this.customLabelsTableData = await this.#api.getCustomLabels(namespace); break;
                case 'visual-force-pages':                 this.visualForcePagesTableData = await this.#api.getVisualForcePages(namespace); break;
                case 'visual-force-components':            this.visualForceComponentsTableData = await this.#api.getVisualForceComponents(namespace); break;
                case 'lightning-pages':                    this.lightningPagesTableData = await this.#api.getLightningPages(namespace); break;
                case 'lightning-aura-components':          this.auraComponentsTableData = await this.#api.getLightningAuraComponents(namespace); break;
                case 'lightning-web-components':           this.lightningWebComponentsTableData = await this.#api.getLightningWebComponents(namespace); break;
                case 'apex-classes':                       
                case 'apex-recompilation-needed':          
                case 'apex-triggers':                      
                case 'schedulable-classes-not-scheduled':  
                case 'apex-jobs':                          
                case 'apex-unit-tests':                    this.apexClassesTableData = await this.#api.getApexClasses(namespace); break;
                case 'dashboards':                         this.dashboardsTableData = await this.#api.getDashboards(); break;
                case 'reports':                            this.reportsTableData = await this.#api.getReports(); break;
                case 'cache-manager':                      this.cacheManagerData = await this.#api.getCacheInformation(); break;
                default:
            }
            this.#spinner.sectionEnded(section, 'Done');
            this.#spinner.close();

        } catch (error) {
            this.#spinner.sectionFailed(section, error);
        }
    }

    customFieldsTableColumns = [
        { label: 'Object',              type: 'id',               data: { ref: 'objectRef', value: 'label', url: 'url' }},
        { label: 'Object Type',         type: 'text',             data: { ref: 'objectRef.typeRef', value: 'label' }},
        { label: 'Field',               type: 'id',               data: { value: 'name', url: 'url' }},
        { label: 'Package',             type: 'text',             data: { value: 'package' }},
        { label: 'Using',               type: 'numeric',          data: { ref: 'dependencies.using', value: 'length' }},
        { label: 'Referenced in',       type: 'numeric',          data: { ref: 'dependencies.referenced', value: 'length', min: 1, valueBeforeMin: 'Not referenced anywhere.' }},
        { label: 'Ref. in Layout?',     type: 'numeric',          data: { ref: 'dependencies.referencedByTypes', value: 'Layout' }},
        { label: 'Ref. in Apex Class?', type: 'numeric',          data: { ref: 'dependencies.referencedByTypes', value: 'Class' }},
        { label: 'Ref. in Flow?',       type: 'numeric',          data: { ref: 'dependencies.referencedByTypes', value: 'Flow' }},
        { label: 'Dependencies',        type: 'dependencyViewer', data: { value: 'dependencies', id: 'id', name: 'name' }},
        { label: 'Created date',        type: 'dateTime',         data: { value: 'createdDate' }},
        { label: 'Modified date',       type: 'dateTime',         data: { value: 'lastModifiedDate' }},
        { label: 'Description',         type: 'text',             data: { value: 'description', maximumLength: 30, valueIfEmpty: 'No description.' }}
    ];

    customFieldsTableData;

    customLabelsTableColumns = [
        { label: 'Name',                type: 'id',               data: { value: 'name', url: 'url' }},
        { label: 'Package',             type: 'text',             data: { value: 'package' }},
        { label: 'Label',               type: 'text',             data: { value: 'label' }},
        { label: 'Category',            type: 'text',             data: { value: 'category' }},
        { label: 'Language',            type: 'text',             data: { value: 'language' }},
        { label: 'Protected?',          type: 'boolean',          data: { value: 'isProtected' }},
        { label: 'Using',               type: 'numeric',          data: { ref: 'dependencies.using', value: 'length' }},
        { label: 'Referenced in',       type: 'numeric',          data: { ref: 'dependencies.referenced', value: 'length', min: 1, valueBeforeMin: 'Not referenced anywhere.' }},
        { label: 'Ref. in Layout?',     type: 'numeric',          data: { ref: 'dependencies.referencedByTypes', value: 'Layout' }},
        { label: 'Ref. in Apex Class?', type: 'numeric',          data: { ref: 'dependencies.referencedByTypes', value: 'Class' }},
        { label: 'Ref. in Flow?',       type: 'numeric',          data: { ref: 'dependencies.referencedByTypes', value: 'Flow' }},
        { label: 'Dependencies',        type: 'dependencyViewer', data: { value: 'dependencies', id: 'id', name: 'name' }},
        { label: 'Created date',        type: 'dateTime',         data: { value: 'createdDate' }},
        { label: 'Modified date',       type: 'dateTime',         data: { value: 'lastModifiedDate' }},
        { label: 'Value',               type: 'text',             data: { value: 'value', maximumLength: 30 }}
    ];

    customLabelsTableData;

    auraComponentsTableColumns = [
        { label: 'Name',                type: 'id',               data: { value: 'name', url: 'url' }},
        { label: 'API Version',         type: 'numeric',          data: { value: 'apiVersion' }},
        { label: 'Package',             type: 'text',             data: { value: 'package' }},
        { label: 'Using',               type: 'numeric',          data: { ref: 'dependencies.using', value: 'length' }},
        { label: 'Referenced in',       type: 'numeric',          data: { ref: 'dependencies.referenced', value: 'length', min: 1, valueBeforeMin: 'Not referenced anywhere.' }},
        { label: 'Dependencies',        type: 'dependencyViewer', data: { value: 'dependencies', id: 'id', name: 'name' }},
        { label: 'Created date',        type: 'dateTime',         data: { value: 'createdDate' }},
        { label: 'Modified date',       type: 'dateTime',         data: { value: 'lastModifiedDate' }},
        { label: 'Description',         type: 'text',             data: { value: 'description', maximumLength: 30, valueIfEmpty: 'No description.' }}
    ];

    auraComponentsTableData;

    lightningPagesTableColumns = [
        { label: 'Name',                type: 'id',               data: { value: 'name', url: 'url' }},
        { label: 'Package',             type: 'text',             data: { value: 'package' }},
        { label: 'Using',               type: 'numeric',          data: { ref: 'dependencies.using', value: 'length' }},
        { label: 'Referenced in',       type: 'numeric',          data: { ref: 'dependencies.referenced', value: 'length', min: 1, valueBeforeMin: 'Not referenced anywhere.' }},
        { label: 'Dependencies',        type: 'dependencyViewer', data: { value: 'dependencies', id: 'id', name: 'name' }},
        { label: 'Created date',        type: 'dateTime',         data: { value: 'createdDate' }},
        { label: 'Modified date',       type: 'dateTime',         data: { value: 'lastModifiedDate' }},
        { label: 'Description',         type: 'text',             data: { value: 'description', maximumLength: 30, valueIfEmpty: 'No description.' }}
    ];

    lightningPagesTableData;

    lightningWebComponentsTableColumns = [
        { label: 'Name',                type: 'id',               data: { value: 'name', url: 'url' }},
        { label: 'API Version',         type: 'numeric',          data: { value: 'apiVersion' }},
        { label: 'Package',             type: 'text',             data: { value: 'package' }},
        { label: 'Using',               type: 'numeric',          data: { ref: 'dependencies.using', value: 'length' }},
        { label: 'Referenced in',       type: 'numeric',          data: { ref: 'dependencies.referenced', value: 'length', min: 1, valueBeforeMin: 'Not referenced anywhere.' }},
        { label: 'Dependencies',        type: 'dependencyViewer', data: { value: 'dependencies', id: 'id', name: 'name' }},
        { label: 'Created date',        type: 'dateTime',         data: { value: 'createdDate' }},
        { label: 'Modified date',       type: 'dateTime',         data: { value: 'lastModifiedDate' }},
        { label: 'Description',         type: 'text',             data: { value: 'description', maximumLength: 30, valueIfEmpty: 'No description.' }}
    ]

    lightningWebComponentsTableData;

    permissionSetsTableColumns = [
        { label: 'Name',             type: 'id',       data: { value: 'name', url: 'url' }},
        { label: 'Is Group?',        type: 'boolean',  data: { value: 'isGroup' }},
        { label: 'Custom',           type: 'boolean',  data: { value: 'isCustom' }},
        { label: '#FLSs',            type: 'numeric',  data: { value: 'nbFieldPermissions', max: 50, valueAfterMax: '50+' }},
        { label: '#Object CRUDs',    type: 'numeric',  data: { value: 'nbObjectPermissions', max: 50, valueAfterMax: '50+' }},            
        { label: 'License',          type: 'text',     data: { value: 'license' }},
        { label: 'Package',          type: 'text',     data: { value: 'package' }},
        { label: '#Active users',    type: 'numeric',  data: { value: 'memberCounts', max: 50, valueAfterMax: '50+', min: 1, valueBeforeMin: 'No active user on this permission set!' }},
        { label: 'Users\' profiles', type: 'ids',      data: { ref: 'profileRefs', value: 'name', url: 'url' }},
        { label: 'Created date',     type: 'dateTime', data: { value: 'createdDate' }},
        { label: 'Modified date',    type: 'dateTime', data: { value: 'lastModifiedDate' }},
        { label: 'Description',      type: 'text',     data: { value: 'description', maximumLength: 30, valueIfEmpty: 'No description.' }}
    ];

    permissionSetsTableData;

    profilesTableColumns = [
        { label: 'Name',            type: 'id',       data: { value: 'name', url: 'url' }},
        { label: 'Custom',          type: 'boolean',  data: { value: 'isCustom' }},
        { label: '#FLSs',           type: 'numeric',  data: { value: 'nbFieldPermissions', max: 50, valueAfterMax: '50+' }},
        { label: '#Object CRUDs',   type: 'numeric',  data: { value: 'nbObjectPermissions', max: 50, valueAfterMax: '50+' }},            
        { label: 'License',         type: 'text',     data: { value: 'license' }},
        { label: 'Package',         type: 'text',     data: { value: 'package' }},
        { label: '#Active users',   type: 'numeric',  data: { value: 'memberCounts', max: 50, valueAfterMax: '50+', min: 1, valueBeforeMin: 'No active user on this profile!' }},
        { label: 'Created date',    type: 'dateTime', data: { value: 'createdDate' }},
        { label: 'Modified date',   type: 'dateTime', data: { value: 'lastModifiedDate' }},
        { label: 'Description',     type: 'text',     data: { value: 'description', maximumLength: 30, valueIfEmpty: 'No description.' }}
    ];

    profilesTableData;

    publicGroupsTableColumns = [
        { label: 'Name',             type: 'id',       data: { value: 'name', url: 'url' }},
        { label: 'Developer Name',   type: 'text',     data: { value: 'developerName' }},
        { label: 'With bosses?',     type: 'boolean',  data: { value: 'includeBosses' }},
        { label: 'Included groups',  type: 'ids',      data: { ref: 'directGroups', value: 'id', url: 'url' }},
        { label: 'Included users',   type: 'ids',      data: { ref: 'directUsers', value: 'id', url: 'url' }},
        { label: 'All active users', type: 'ids',      data: { ref: 'indirectUsers', value: 'id', url: 'url' }},
    ];

    publicGroupsTableData;

    queuesTableColumns = [
        { label: 'Name',             type: 'id',       data: { value: 'name', url: 'url' }},
        { label: 'Developer Name',   type: 'text',     data: { value: 'developerName' }},
        { label: 'With bosses?',     type: 'boolean',  data: { value: 'includeBosses' }},
        { label: 'Included groups',  type: 'ids',      data: { ref: 'directGroups', value: 'id' }},
        { label: 'Included users',   type: 'ids',      data: { ref: 'directUsers', value: 'id' }},
        { label: 'All active users', type: 'ids',      data: { ref: 'indirectUsers', value: 'id' }},
    ];

    queuesTableData;

    usersTableColumns = [
        { label: 'User Name',       type: 'id',       data: { value: 'name', url: 'url' }},
        { label: 'Under LEX?',      type: 'boolean',  data: { value: 'onLightningExperience' }},
        { label: 'Last login',      type: 'dateTime', data: { value: 'lastLogin', valueIfEmpty: 'Never logged!' }},
        { label: 'Failed logins',   type: 'numeric',  data: { value: 'numberFailedLogins' }},
        { label: 'Password change', type: 'dateTime', data: { value: 'lastPasswordChange' }},
        { label: 'Key permissions', type: 'texts',    data: { ref: 'importantPermissions' }},
        { label: 'Profile',         type: 'id',       data: { ref: 'profileRef', url: 'url', value: 'name' }},
        { label: 'Permission Sets', type: 'ids',      data: { ref: 'permissionSetRefs', url: 'url', value: 'name' }}
    ];

    usersTableData;

    visualForceComponentsTableColumns = [
        { label: 'Name',                type: 'id',               data: { value: 'name', url: 'url' }},
        { label: 'API Version',         type: 'numeric',          data: { value: 'apiVersion' }},
        { label: 'Package',             type: 'text',             data: { value: 'package' }},
        { label: 'Using',               type: 'numeric',          data: { ref: 'dependencies.using', value: 'length' }},
        { label: 'Referenced in',       type: 'numeric',          data: { ref: 'dependencies.referenced', value: 'length', min: 1, valueBeforeMin: 'Not referenced anywhere.' }},
        { label: 'Dependencies',        type: 'dependencyViewer', data: { value: 'dependencies', id: 'id', name: 'name' }},
        { label: 'Created date',        type: 'dateTime',         data: { value: 'createdDate' }},
        { label: 'Modified date',       type: 'dateTime',         data: { value: 'lastModifiedDate' }},
        { label: 'Description',         type: 'text',             data: { value: 'description', maximumLength: 30, valueIfEmpty: 'No description.' }}
    ];

    visualForceComponentsTableData;

    visualForcePagesTableColumns = [
        { label: 'Name',                type: 'id',               data: { value: 'name', url: 'url' }},
        { label: 'API Version',         type: 'numeric',          data: { value: 'apiVersion' }},
        { label: 'Mobile',              type: 'boolean',          data: { value: 'isMobileReady' }},
        { label: 'Package',             type: 'text',             data: { value: 'package' }},
        { label: 'Using',               type: 'numeric',          data: { ref: 'dependencies.using', value: 'length' }},
        { label: 'Referenced in',       type: 'numeric',          data: { ref: 'dependencies.referenced', value: 'length', min: 1, valueBeforeMin: 'Not referenced anywhere.' }},
        { label: 'Dependencies',        type: 'dependencyViewer', data: { value: 'dependencies', id: 'id', name: 'name' }},
        { label: 'Created date',        type: 'dateTime',         data: { value: 'createdDate' }},
        { label: 'Modified date',       type: 'dateTime',         data: { value: 'lastModifiedDate' }},
        { label: 'Description',         type: 'text',             data: { value: 'description', maximumLength: 30, valueIfEmpty: 'No description.' }}
    ];

    visualForcePagesTableData;

    apexClassesTableColumns;
    apexClassesTableData;
    apexTriggersTableColumns;
    apexTriggersTableData;
    apexTestsTableColumns;
    apexTestsTableData;
    
    dashboardsTableData;
    reportsTableData;
    objectsOWDTableData;
    rolesTableData;
    flowsTableData;
    processBuildersTableData;
    workflowsTableData;

    cacheManagerData;

    objectInformationData;
}