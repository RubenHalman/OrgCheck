import { OrgCheckDataset } from "./orgcheck-api-dataset";
import { OrgCheckMap } from './orgcheck-api-type-map';
import { SFDC_CustomLabel } from './orgcheck-api-data-customlabel';

export class OrgCheckDatasetCustomLabels extends OrgCheckDataset {

    run(sfdcManager, resolve, reject) {

        // SOQL queries on ExternalString
        sfdcManager.soqlQuery([{ 
            string: 'SELECT Id, Name, NamespacePrefix, Category, IsProtected, Language, MasterLabel, Value '+
                    'FROM ExternalString '+
                    'WHERE ManageableState IN (\'installedEditable\', \'unmanaged\') ',
            tooling: true
        }]).then((results) => {

            // Init the map
            const customLabels = new OrgCheckMap();

            // Set the map
            results[0].records
                .forEach((record) => {

                    // Get the ID15 of this custom label
                    const id = sfdcManager.caseSafeId(record.Id);

                    // Create the SFDC_CustomLabel instance
                    const customLabel = new SFDC_CustomLabel({
                        id: id,
                        url: sfdcManager.setupUrl('custom-label', record.Id),
                        name: record.Name,
                        package: (record.NamespacePrefix || ''),
                        category: record.Category,
                        isProtected: record.IsProtected === true,
                        language: record.Language,
                        label: record.MasterLabel,
                        value: record.Value
                    });

                    // Compute the score of this user, with the following rule:
                    //  - If the field is not used by any other entity (based on the Dependency API), then you get +1.
                    if (customLabel.dependencies?.referenced.length === 0) customLabel.setBadField('dependencies.referenced');
                    // Add it to the map  
                    customLabels.set(customLabel.id, customLabel);
                });

            // Return data
            resolve(customLabels);
        }).catch(reject);
    } 
}