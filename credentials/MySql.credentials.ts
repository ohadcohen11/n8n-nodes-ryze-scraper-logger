import type {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class MySql implements ICredentialType {
	name = 'mySql';

	displayName = 'MySQL';

	documentationUrl = 'https://dev.mysql.com/doc/';

	properties: INodeProperties[] = [
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: 'localhost',
			required: true,
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 3306,
			required: true,
		},
		{
			displayName: 'User',
			name: 'user',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
	];
}
