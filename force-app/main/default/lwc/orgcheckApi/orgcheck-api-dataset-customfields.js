import { OrgCheckDataset } from "./orgcheck-api-dataset";
import { OrgCheckMap } from './orgcheck-api-type-map';
import { SFDC_Field } from "./orgcheck-api-data-field";

export class OrgCheckDatasetCustomFields extends OrgCheckDataset {

    run(sfdcManager, resolve, reject) {

        // SOQL query on CustomField
        sfdcManager.soqlQuery([{ 
            tooling: true,
            string: 'SELECT Id, EntityDefinition.QualifiedApiName, EntityDefinition.IsCustomSetting, ' +
                        'DeveloperName, NamespacePrefix, Description, CreatedDate, LastModifiedDate '+
                    'FROM CustomField '+
                    'WHERE ManageableState IN (\'installedEditable\', \'unmanaged\')',
            addDependenciesBasedOnField: 'Id'
        }]).then((results) => {

            // Init the map
            const customFields = new OrgCheckMap();

            // Set the map
            results[0].records
                .filter((record) => (record.EntityDefinition ? true : false))
                .forEach((record) => {

                    // Get the ID15 of this custom field
                    const id = sfdcManager.caseSafeId(record.Id);

                    // Create the SFDC_CustomField instance
                    const customField = new SFDC_Field({
                        id: id,
                        url: sfdcManager.setupUrl('field', record.Id, record.EntityDefinition.QualifiedApiName, 
                                    sfdcManager.getObjectType(record.EntityDefinition.QualifiedApiName, record.EntityDefinition.IsCustomSetting)),
                        name: record.DeveloperName,
                        label: record.DeveloperName,
                        package: (record.NamespacePrefix || ''),
                        description: record.Description,
                        createdDate: record.CreatedDate,
                        lastModifiedDate: record.LastModifiedDate,
                        objectId: sfdcManager.caseSafeId(record.EntityDefinition.QualifiedApiName),
                        dependencies: results[0].dependencies
                    });

                    // Compute the score of this user, with the following rule:
                    //  - If the field has no description, then you get +1.
                    //  - If the field is not used by any other entity (based on the Dependency API), then you get +1.
                    if (sfdcManager.isEmpty(customField.description)) customField.setBadField('description');
                    if (customField.dependencies?.referenced.length === 0) customField.setBadField('dependencies.referenced');

                    // Add it to the map  
                    customFields.set(customField.id, customField);
                });

            // Return data
            resolve(customFields);
        }).catch(reject);
    } 
}