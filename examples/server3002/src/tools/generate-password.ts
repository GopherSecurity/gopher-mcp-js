/**
 * Generate a secure password with customizable options
 * No authentication required - public tool
 */
export const generatePassword = {
  name: 'generate-password',
  description: 'Generate a secure password with customizable length and character sets',
  inputSchema: {
    type: 'object',
    properties: {
      length: {
        type: 'number',
        description: 'Length of the password (8-128 characters)',
        minimum: 8,
        maximum: 128,
        default: 16,
      },
      includeUppercase: {
        type: 'boolean',
        description: 'Include uppercase letters (A-Z)',
        default: true,
      },
      includeLowercase: {
        type: 'boolean',
        description: 'Include lowercase letters (a-z)',
        default: true,
      },
      includeNumbers: {
        type: 'boolean',
        description: 'Include numbers (0-9)',
        default: true,
      },
      includeSymbols: {
        type: 'boolean',
        description: 'Include symbols (!@#$%^&*)',
        default: true,
      },
      excludeSimilar: {
        type: 'boolean',
        description: 'Exclude similar looking characters (0,O,l,1,I)',
        default: false,
      },
    },
    required: [],
  },
  handler: async (request: any) => {
    // Handle different parameter structures
    let params = {};

    if (request.params?.arguments) {
      if (typeof request.params.arguments === 'string') {
        // Gopher-orch sends arguments as JSON string
        try {
          params = JSON.parse(request.params.arguments);
        } catch (e) {
          params = {};
        }
      } else {
        // Direct calls send arguments as object
        params = request.params.arguments;
      }
    } else {
      // Fallback to direct params
      params = request.params || {};
    }

    const {
      length = 16,
      includeUppercase = true,
      includeLowercase = true,
      includeNumbers = true,
      includeSymbols = true,
      excludeSimilar = false,
    } = params;

    // Validate length
    if (length < 8 || length > 128) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Password length must be between 8 and 128 characters.',
          },
        ],
        isError: true,
      };
    }

    // Character sets
    let uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let lowercase = 'abcdefghijklmnopqrstuvwxyz';
    let numbers = '0123456789';
    let symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    // Exclude similar characters if requested
    if (excludeSimilar) {
      uppercase = uppercase.replace(/[O]/g, '');
      lowercase = lowercase.replace(/[l]/g, '');
      numbers = numbers.replace(/[01]/g, '');
      symbols = symbols.replace(/[|]/g, '');
    }

    // Build character pool
    let charPool = '';
    let requiredChars: string[] = [];

    if (includeUppercase) {
      charPool += uppercase;
      requiredChars.push(uppercase[Math.floor(Math.random() * uppercase.length)]);
    }
    if (includeLowercase) {
      charPool += lowercase;
      requiredChars.push(lowercase[Math.floor(Math.random() * lowercase.length)]);
    }
    if (includeNumbers) {
      charPool += numbers;
      requiredChars.push(numbers[Math.floor(Math.random() * numbers.length)]);
    }
    if (includeSymbols) {
      charPool += symbols;
      requiredChars.push(symbols[Math.floor(Math.random() * symbols.length)]);
    }

    // Ensure at least one character set is selected
    if (charPool.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: At least one character set must be included.',
          },
        ],
        isError: true,
      };
    }

    // Generate password
    let password = '';

    // First, add required characters to ensure all selected types are present
    for (const char of requiredChars) {
      password += char;
    }

    // Fill the rest with random characters
    for (let i = password.length; i < length; i++) {
      password += charPool[Math.floor(Math.random() * charPool.length)];
    }

    // Shuffle the password to randomize the position of required characters
    password = password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');

    // Calculate password strength
    let strength = 0;
    let strengthText = '';

    if (includeUppercase) strength += 26;
    if (includeLowercase) strength += 26;
    if (includeNumbers) strength += 10;
    if (includeSymbols) strength += symbols.length;

    const entropy = Math.log2(Math.pow(strength, length));

    if (entropy < 40) {
      strengthText = 'Weak';
    } else if (entropy < 60) {
      strengthText = 'Fair';
    } else if (entropy < 80) {
      strengthText = 'Good';
    } else if (entropy < 100) {
      strengthText = 'Strong';
    } else {
      strengthText = 'Very Strong';
    }

    // Build settings summary
    const settings: string[] = [];
    if (includeUppercase) settings.push('Uppercase');
    if (includeLowercase) settings.push('Lowercase');
    if (includeNumbers) settings.push('Numbers');
    if (includeSymbols) settings.push('Symbols');
    if (excludeSimilar) settings.push('No Similar Chars');

    return {
      content: [
        {
          type: 'text',
          text: `Generated Password:\n\n🔐 ${password}\n\nSettings:\n• Length: ${length} characters\n• Character types: ${settings.join(', ')}\n• Strength: ${strengthText}\n• Entropy: ${entropy.toFixed(1)} bits\n\n💡 Tip: Store this password securely and don't reuse it for multiple accounts.`,
        },
      ],
    };
  },
};
