import { OrgCheckDataset } from '../core/orgcheck-api-dataset';
import { SFDC_CustomLabel } from '../data/orgcheck-api-data-customlabel';

export class OrgCheckDatasetCustomLabels extends OrgCheckDataset {

    run(sfdcManager, dataFactory, localLogger, resolve, reject) {

        // SOQL queries on ExternalString
        sfdcManager.soqlQuery([{ 
            tooling: true,
            string: 'SELECT Id, Name, NamespacePrefix, Category, IsProtected, Language, MasterLabel, Value, '+
                        'CreatedDate, LastModifiedDate '+
                    'FROM ExternalString '+
                    'WHERE ManageableState IN (\'installedEditable\', \'unmanaged\') ',
            addDependenciesBasedOnField: 'Id'
        }]).then((results) => {

            // Init the map
            const customLabels = new Map();

            // Init the factory
            const labelDataFactory = dataFactory.getInstance(SFDC_CustomLabel);

            // Set the map
            localLogger.log(`Parsing ${results[0].records.length} Custom Labels...`);
            results[0].records
                .forEach((record) => {

                    // Get the ID15 of this custom label
                    const id = sfdcManager.caseSafeId(record.Id);

                    // Create the instance
                    const customLabel = labelDataFactory.create({
                        id: id,
                        url: sfdcManager.setupUrl('custom-label', record.Id),
                        name: record.Name,
                        package: (record.NamespacePrefix || ''),
                        category: record.Category,
                        isProtected: record.IsProtected === true,
                        language: record.Language,
                        label: record.MasterLabel,
                        value: record.Value,
                        createdDate: record.CreatedDate, 
                        lastModifiedDate: record.LastModifiedDate,
                        allDependencies: results[0].allDependencies
                    });

                    // Compute the score of this item
                    labelDataFactory.computeScore(customLabel);

                    // Add it to the map  
                    customLabels.set(customLabel.id, customLabel);
                });

            // Return data
            resolve(customLabels);
        }).catch(reject);
    } 
}