import { OrgCheckDataDependencies } from './orgcheck-api-data-dependencies';
import { SFDC_ApexClass } from '../data/orgcheck-api-data-apexclass';
import { SFDC_ApexTrigger } from '../data/orgcheck-api-data-apextrigger';
import { SFDC_CustomLabel } from '../data/orgcheck-api-data-customlabel';
import { SFDC_Field } from '../data/orgcheck-api-data-field';
import { SFDC_Flow } from '../data/orgcheck-api-data-flow';
import { SFDC_Group } from '../data/orgcheck-api-data-group';
import { SFDC_LightningAuraComponent } from '../data/orgcheck-api-data-lightningauracomponent';
import { SFDC_LightningPage } from '../data/orgcheck-api-data-lightningpage';
import { SFDC_LightningWebComponent } from '../data/orgcheck-api-data-lightningwebcomponent';
import { SFDC_PermissionSet } from '../data/orgcheck-api-data-permissionset';
import { SFDC_Profile } from '../data/orgcheck-api-data-profile';
import { SFDC_ProfilePasswordPolicy } from '../data/orgcheck-api-data-profilepasswordpolicy';
import { SFDC_ProfileRestrictions } from '../data/orgcheck-api-data-profilerestrictions';
import { SFDC_User } from '../data/orgcheck-api-data-user';
import { SFDC_UserRole } from '../data/orgcheck-api-data-userrole';
import { SFDC_VisualForceComponent } from '../data/orgcheck-api-data-visualforcecomponent';
import { SFDC_VisualForcePage } from '../data/orgcheck-api-data-visualforcepage';
import { SFDC_Workflow } from '../data/orgcheck-api-data-workflow.js';
import { SFDC_ValidationRule } from '../data/orgcheck-api-data-validationrule';
import { SFDC_RecordType } from '../data/orgcheck-api-data-recordtype';
import { SFDC_Limit } from '../data/orgcheck-api-data-limit';

export class OrgCheckDataFactory2 {

    #dataClass;
    #validations;
    #isDependenciesNeeded;

    constructor(dataClass, validations, isDependenciesNeeded) {
        this.#dataClass = dataClass;
        this.#validations = validations;
        this.#isDependenciesNeeded = isDependenciesNeeded;
    };

    create(setup) {
        // Create a row from the protofype
        const row = new this.#dataClass();
        // Copy properties from setup to object
        // NB: Please note that ONLY the properties explicitely set in the class will be copied from setup to object
        Object.keys(row).forEach((p) => { row[p] = setup[p]; });
        // We want to make sure no new property is added to the row (there should be only the ones declared in classes!)
        Object.seal(row);
        // For this type if we have at least one validation rule, then score is needed
        if (this.#validations.length > 0) {
            row.score = 0;
            row.badFields = [];
            row.badReasonIds = [];
        }
        // If dependencies are needed...
        if (this.#isDependenciesNeeded === true && setup.allDependencies) {
            row.dependencies = new OrgCheckDataDependencies(setup.allDependencies, row.id);
        }
        // Return the row finally
        return row;
    }

    computeScore(row) { 
        this.#validations
            .filter(v => { 
                try { 
                    return v.formula(row); } 
                catch (error) { 
                    console.error('COMPUTE SCORE', error, row); 
                }})
            .forEach(v => {
                row.score++;
                row.badFields.push(v.badField);
                row.badReasonIds.push(v.id);
            });
        return row;
    }

    createWithScore(setup) {
        return this.computeScore(this.create(setup));
    }
}

export class OrgCheckDataFactory {

    #allValidations;
    #needDepencencies;
    #instances;

    constructor(sfdcManager) {

        this.#allValidations = [
            { 
                description: 'Not referenced anywhere',
                formula: (d) => d.dependencies?.referenced?.length === 0, 
                errorMessage: 'This component is not referenced anywhere (as we were told by the Dependency API). Please review the need to keep it in your org.',
                badField: 'dependencies.referenced',
                applicable: [ SFDC_ApexClass, SFDC_ApexTrigger, SFDC_Field, SFDC_CustomLabel, SFDC_Flow, SFDC_LightningPage, SFDC_VisualForceComponent, SFDC_VisualForcePage ]
            }, {
                description: 'API Version too old',
                formula: (d) => sfdcManager.isVersionOld(d.apiVersion) === true,
                errorMessage: 'The API version of this component is too old. Please update it to a newest version.',
                badField: 'apiVersion',
                applicable: [ SFDC_ApexClass, SFDC_ApexTrigger ]
            }, {
                description: 'No assert in this Apex Test',
                formula: (d) => d.isTest === true && d.nbSystemAsserts === 0,
                errorMessage: 'This apex test does not contain any assert! Best practices force you to define asserts in tests.',
                badField: 'nbSystemAsserts',
                applicable: [ SFDC_ApexClass ]
            }, {
                description: 'No description',
                formula: (d) => sfdcManager.isEmpty(d.description) === true,
                errorMessage: 'This component does not have a description. Best practices force you to use the Description field to give some informative context about why and how it is used/set/govern.',
                badField: 'description',
                applicable: [ SFDC_Flow, SFDC_LightningPage, SFDC_LightningAuraComponent, SFDC_LightningWebComponent, SFDC_VisualForcePage, SFDC_VisualForceComponent, SFDC_Workflow ]
            }, {
                description: 'No description for custom component',
                formula: (d) => d.isCustom === true && sfdcManager.isEmpty(d.description) === true,
                errorMessage: 'This custom component does not have a description. Best practices force you to use the Description field to give some informative context about why and how it is used/set/govern.',
                badField: 'description',
                applicable: [ SFDC_Field, SFDC_PermissionSet, SFDC_Profile ]
            }, {
                description: 'No explicit sharing in apex class',
                formula: (d) => d.isSharingMissing === true,
                errorMessage: 'This Apex Class does not specify a sharing model. Best practices force you to specify with, without or inherit sharing to better control the visibility of the data you process in Apex.',
                badField: 'specifiedSharing',
                applicable: [ SFDC_ApexClass ]
            }, {
                description: 'Schedulable should be scheduled',
                formula: (d) => d.isScheduled === false && d.isSchedulable === true,
                errorMessage: 'This Apex Class implements Schedulable but is not scheduled. What is the point? Is this class still necessary?',
                badField: 'isScheduled',
                applicable: [ SFDC_ApexClass ]
            }, {
                description: 'Not able to compile class',
                formula: (d) => d.needsRecompilation === true,
                errorMessage: 'This Apex Class can not be compiled for some reason. You should try to recompile it. If the issue remains you need to consider refactorying this class or the classes that it is using.',
                badField: 'name',
                applicable: [ SFDC_ApexClass ]
            }, {
                description: 'No coverage for this class',
                formula: (d) => isNaN(d.coverage) || !d.coverage,
                errorMessage: 'This Apex Class does not have any code coverage. Consider launching the corresponding tests that will bring some coverage. If you do not know which test to launch just run them all!',
                badField: 'coverage',
                applicable: [ SFDC_ApexClass ]
            }, {
                description: 'Coverage not enough',
                formula: (d) => d.coverage < 0.75,
                errorMessage: 'This Apex Class does not have enough code coverage (less than 75% of lines are covered by successful unit tests). Maybe you ran not all the unit tests to cover this class entirely? If you did, then consider augmenting that coverage with new test methods.',
                badField: 'coverage',
                applicable: [ SFDC_ApexClass ]
            }, {
                description: 'Apex trigger should not contain SOQL statement',
                formula: (d) => d.hasSOQL === true,
                errorMessage: 'This Apex Trigger contains at least one SOQL statement. Best practices force you to move any SOQL statement in dedicated Apex Classes that you would call from the trigger. Please update the code accordingly.',
                badField: 'hasSOQL',
                applicable: [ SFDC_ApexTrigger ]
            }, {
                description: 'Apex trigger should not contain DML action',
                formula: (d) => d.hasDML === true,
                errorMessage: 'This Apex Trigger contains at least one DML action. Best practices force you to move any DML action in dedicated Apex Classes that you would call from the trigger. Please update the code accordingly.',
                badField: 'hasDML',
                applicable: [ SFDC_ApexTrigger ]
            }, {
                description: 'Apex Trigger should not contain logic',
                formula: (d) => d.length > 5000,
                errorMessage: 'Due to the massive number of source code in this Apex Trigger, we suspect that it contains logic. Best practices force you to move any logic in dedicated Apex Classes that you would call from the trigger. Please update the code accordingly.',
                badField: 'length',
                applicable: [ SFDC_ApexTrigger ]
            }, {
                description: 'No direct member for this group',
                formula: (d) => d.nbDirectMembers === 0,
                errorMessage: 'This public group (or queue) does not contain any direct members (users or sub groups). Is it empty on purpose? Maybe you should review its use in your org...',
                badField: 'nbDirectMembers',
                applicable: [ SFDC_Group ]
            }, {
                description: 'No user for this group',
                formula: (d) => d.nbUsers === 0,
                errorMessage: 'This public group (or queue) does not contain any users either direclty or via a sub group. Is it empty as a result on purpose? Maybe you should review its use in your org...',
                badField: 'nbUsers',
                applicable: [ SFDC_Group ]
            }, {
                description: 'Custom permset or profile with no member',
                formula: (d) => d.isCustom === true && d.memberCounts === 0,
                errorMessage: 'This custom permission set (or custom profile) has no members. Is it empty on purpose? Maybe you should review its use in your org...',
                badField: 'memberCounts',
                applicable: [ SFDC_PermissionSet, SFDC_Profile ]
            }, {
                description: 'Role with no active users',
                formula: (d) => d.activeMembersCount === 0,
                errorMessage: 'This role has no active users assigned to it. Is it on purpose? Maybe you should review its use in your org...',
                badField: 'activeMembersCount',
                applicable: [ SFDC_UserRole ]
            }, {
                description: 'Active user not under LEX',
                formula: (d) => d.onLightningExperience === false,
                errorMessage: 'This user is still using Classic. Time to switch to Lightning for all your users, don\'t you think?',
                badField: 'onLightningExperience',
                applicable: [ SFDC_User ]
            }, {
                description: 'Active user never logged',
                formula: (d) => d.lastLogin === null,
                errorMessage: 'This active user never logged yet. Time to optimize your licence cost!',
                badField: 'lastLogin',
                applicable: [ SFDC_User ]
            }, {
                description: 'Workflow with no action',
                formula: (d) => d.hasAction === false,
                errorMessage: 'This workflow has no action, please review it and potentially remove it.',
                badField: 'hasAction',
                applicable: [ SFDC_Workflow ]
            }, {
                description: 'Workflow with empty time triggered list',
                formula: (d) => d.emptyTimeTriggers.length > 0,
                errorMessage: 'This workflow is time triggered but with no time triggered action, please review it.',
                badField: 'emptyTimeTriggers',
                applicable: [ SFDC_Workflow ]
            }, {
                description: 'Password policy with question containing password!',
                formula: (d) => d.passwordQuestion === true,
                errorMessage: 'This profile password policy allows to have password in the question! Please change that setting as it is clearly a lack of security in your org!',
                badField: 'passwordQuestion',
                applicable: [ SFDC_ProfilePasswordPolicy ]
            }, {
                description: 'Password policy with too big expiration',
                formula: (d) => d.passwordExpiration > 90,
                errorMessage: 'This profile password policy allows to have password that expires after 90 days. Please consider having a shorter period of time for expiration if you policy.',
                badField: 'passwordExpiration',
                applicable: [ SFDC_ProfilePasswordPolicy ]
            }, {
                description: 'Password policy with no expiration',
                formula: (d) => d.passwordExpiration === 0,
                errorMessage: 'This profile password policy allows to have password that never expires. Why is that? Do you have this profile for technical users? Please reconsider this setting and use JWT authentication instead for technical users.',
                badField: 'passwordExpiration',
                applicable: [ SFDC_ProfilePasswordPolicy ]
            }, {
                description: 'Password history too small',
                formula: (d) => d.passwordHistory < 3,
                errorMessage: 'This profile password policy allows users to set their password with a too-short memory. For example, they can keep on using the same different password everytime you ask them to change it. Please increase this setting.',
                badField: 'passwordHistory',
                applicable: [ SFDC_ProfilePasswordPolicy ]
            }, {
                description: 'Password minimum size too small',
                formula: (d) => d.minimumPasswordLength < 8,
                errorMessage: 'This profile password policy allows users to set passwords with less than 8 charcaters. That minimum length is not strong enough. Please increase this setting.',
                badField: 'minimumPasswordLength',
                applicable: [ SFDC_ProfilePasswordPolicy ]
            }, {
                description: 'Password complexity too weak',
                formula: (d) => d.passwordComplexity < 3,
                errorMessage: 'This profile password policy allows users to set too-easy passwords. The complexity you choose is not storng enough. Please increase this setting.',
                badField: 'passwordComplexity',
                applicable: [ SFDC_ProfilePasswordPolicy ]
            }, {
                description: 'No max login attempts set',
                formula: (d) => d.maxLoginAttempts === undefined,
                errorMessage: 'This profile password policy allows users to try infinitely to log in without locking the access. Please review this setting.',
                badField: 'passwordExpiration',
                applicable: [ SFDC_ProfilePasswordPolicy ]
            }, {
                description: 'No lockout period set',
                formula: (d) => d.lockoutInterval === undefined,
                errorMessage: 'This profile password policy does not set a value for any locked out period. Please review this setting.',
                badField: 'lockoutInterval',
                applicable: [ SFDC_ProfilePasswordPolicy ]
            }, {
                description: 'IP Range too large',
                formula: (d) => d.ipRanges.filter(i => i.difference > 100000).length > 0,
                errorMessage: 'This profile includes an IP range that is to wide (more than 100.000 IP addresses!). If you set an IP Range it should be not that large. You could split that range into multiple ones. The risk is that you include an IP that is not part of your company. Please review this setting.',
                badField: 'ipRanges',
                applicable: [ SFDC_ProfileRestrictions ]
            }, {
                description: 'Login hours too large',
                formula: (d) => d.loginHours.filter(i => i.difference > 1200).length > 0,
                errorMessage: 'This profile includes a login hour that is to wide (more than 20 hours a day!). If you set a login hour it should reflect the reality. Please review this setting.',
                badField: 'loginHours',
                applicable: [ SFDC_ProfileRestrictions ]
            }, {
                description: 'Inactive component',
                formula: (d) => d.isActive === false,
                errorMessage: 'This component is inactive, so why do not you just remove it from your org?',
                badField: 'isActive',
                applicable: [ SFDC_ValidationRule, SFDC_RecordType, SFDC_ApexTrigger ]
            }, {
                description: 'Near the limit',
                formula: (d) => d.usedPercentage >= 0.80,
                errorMessage: 'This limit is almost reached (>80%). Please review this.',
                badField: 'usedPercentage',
                applicable: [ SFDC_Limit ]
            }
        ].map((v, i) => { v.id = i; return v; });
        Object.freeze(this.#allValidations); 

        this.#needDepencencies = [
            SFDC_ApexClass, SFDC_ApexTrigger, SFDC_Field, SFDC_CustomLabel, SFDC_Flow, 
            SFDC_LightningAuraComponent, SFDC_LightningPage, SFDC_LightningWebComponent,
            SFDC_VisualForceComponent, SFDC_VisualForcePage
        ];
        Object.freeze(this.#needDepencencies); 

        this.#instances = new Map();
    }

    getValidationRule(id) {
        return this.#allValidations[id];
    }

    getInstance(dataClass) {
        // If this dataClass was never asked before, create it and store it in the cache
        if (this.#instances.has(dataClass) === false) {
            const validations = this.#allValidations.filter(v => v.applicable.includes(dataClass));
            const isDependenciesNeeded = this.#needDepencencies.includes(dataClass);
            const instance = new OrgCheckDataFactory2(dataClass, validations, isDependenciesNeeded);
            this.#instances.set(dataClass, instance);
        }
        // Return the instance
        return this.#instances.get(dataClass);
    }
}