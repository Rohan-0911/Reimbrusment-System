#include<stdio.h>
#include<string.h>
#include<stdlib.h>

#include<direct.h>

int user_choice();

void company_name_input();
int is_company_name_valid();
void country_input();
void name_input();
void email_input();
int email_check();
int confirmation();
void pass_input();
int is_char_present(char pass[], int len_pass, char list[], int len_list);

void company_register();

void user_input();
int username_check();
int user_login_check();
void login_output(int status);

char company_name[100];
int country_choice;
char country[20], name[100], email[100], password[100];;

char company_list_file[] = "files/company.txt", register_company[100] = "files/Company/";

char user_name[40], position[10], login_creds[] = "files/login_cred.txt";
int choice, status=0;


int main() {

    while (1) {
        choice = user_choice();

        if (choice==1) {
            company_name_input();
            if (is_company_name_valid()) {
                country_input();
                name_input();
                email_input();
                if (confirmation()) {
                    pass_input();
                    company_register();
                    printf("\nRegistration Successful!!\n");
                }
                else {
                    printf("\nRetry\n");
                }
            }
            else {
                printf("\nCompany with this name %s already exists. Try using another Company name.\n", company_name);
            }
        }

        else if (choice==2) {
            user_input();
            login_output(user_login_check());
        }

        else if (choice==3) {
            printf("Thanks for visiting!!");
            break;
        }

        else {
            printf("Invalid Choice\n");
        }
    }
    return 0;
}

int user_choice() {
    printf("\n1. Register your Company/Organisation\n");
    printf("2. Log-In\n");
    printf("3. Exit\n");
    printf("Choice: ");
    scanf("%d", &choice);
    printf("\n");
    return choice;
}

void company_name_input() {
    printf("Enter Company Name: ");
    scanf(" %[^\n]", company_name);
}

int is_company_name_valid() {
    FILE *fptr;

    char dummy_company_name[100];
    
    fptr = fopen(company_list_file, "a+");

    rewind(fptr);

    while(fscanf(fptr, "%s", dummy_company_name) == 1) {
        if (strcmp(company_name, dummy_company_name) == 0) {
            return 0;
        }
    }

    fclose(fptr);
    return 1;
}

void country_input() {
    int i = country_choice;
    while (i != 1 && i != 2 && i != 3 && i != 4 && i !=5) {
        printf("\nCountry\n");
        printf("1. India\n");
        printf("2, USA\n");
        printf("3. UAE\n");
        printf("4. Europe\n");
        printf("5. Australia\n\n");
        printf("Enter country choice (1-5): ");
        scanf("%d", &country_choice);
        i = country_choice;
    }
    
    switch (country_choice) {
        case 1: {
            strcpy(country, "India");
            break;
        }
        case 2: {
            strcpy(country, "USA");
            break;
        }
        case 3: {
            strcpy(country, "UAE");
            break;
        }
        case 4: {
            strcpy(country, "Europe");
            break;
        }
        case 5: {
            strcpy(country, "Australia");
            break;
        }
    }

    country_choice = 0;
}

void name_input() {
    printf("\nEnter your name: ");
    scanf(" %[^\n]", name);
}

void email_input() {
    int valid_email = 0, email_exist = 1;
    while(valid_email != 1 && email_exist == 1) {
        printf("\nEnter E-mail Address: ");
        scanf(" %[^\n]", email);
        for (int i = 0; email[i] != '\0' ; i++) {
            if (email[i] == '@') {
                valid_email++;
            }
        }
        if (valid_email == 1) {  
        email_exist = email_check();
            if (email_exist) {
                printf("\nE-mail is already registered\n");
                printf("Try using new E-mail address\n");
                valid_email = 0;
            }
            continue;
        }
        printf("\nInvalid E-mail\n");
        printf("Try again\n");
        valid_email = 0;
    }
}

int email_check() {
    int email_exist = 0;

    FILE *fptr;

    fptr = fopen(login_creds, "r");
    rewind(fptr);
    
    char dum_email[100], p1[10];

    while(fscanf(fptr, "%s %s %s", dum_email, p1, position) == 3) {
        if (strcmp(dum_email, email) == 0) {
            email_exist = 1; 
            break;
        }
    }

    fclose(fptr);
    return email_exist;
}

int confirmation() {
    int confirm;
    printf("\n\nCompany Name: %s\n", company_name);
    printf("Country: %s\n", country);
    printf("Name: %s\n", name);
    printf("E-mail: %s\n\n", email);
    printf("Did you want confirm your details?");
    while(1) {
        printf("\nYES - 1\nNO - 0\nChoice: ");
        scanf("%d", &confirm);
        if (confirm == 1) {
            return 1;
        } 
        else if (confirm == 0) {
            return 0;
        }
    }
}

void pass_input() {
    char ALPHA[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    char alpha[] = "abcdefghijklmnopqrstuvwxyz";
    char alpha1[] = "qwertyuiopQWERTYUIOP";
    char alpha2[] = "asdfghjklASDFGHJKL";
    char alpha3[] = "zxcvbnmZXCVBNM";
    char num[] = {'1','2','3','4','5','6','7','8','9','0','\0'};
    char sp_char[] = {'@','#','$','&','*','/','%','_','-','\0'};
    printf("\nPassword Conditions:\n1. 8 minimum character\n2. Atleast one alphabet from each row\n3. Atleast one uppercase letter\n4. Atleast one lowercase letter\n5. Atleast one number\n6. Atleast one special character from below: (@ , # , $ , & , * , / , %% , _ , - )\n");
    int c=8;
    do {
        int c1=1, c2=1, c3=1, c4=1, c5=1, c6=1, c7=1, c8=1;

        printf("\nEnter your password: ");
        scanf(" %[^\n]", password);
        printf("\n");

        int len = (password);

        if (len>=8) c1 = 0;

        c2 = is_char_present(password, len, ALPHA, (sizeof(ALPHA)/sizeof(ALPHA[0]))-1);
        c3 = is_char_present(password, len, alpha, (sizeof(alpha)/sizeof(alpha[0]))-1);
        c4 = is_char_present(password, len, alpha1, (sizeof(alpha1)/sizeof(alpha1[0]))-1);
        c5 = is_char_present(password, len, alpha2, (sizeof(alpha2)/sizeof(alpha2[0]))-1);
        c6 = is_char_present(password, len, alpha3, (sizeof(alpha3)/sizeof(alpha3[0]))-1);
        c7 = is_char_present(password, len, num, (sizeof(num)/sizeof(num[0]))-1);
        c8 = is_char_present(password, len, sp_char, (sizeof(sp_char)/sizeof(sp_char[0]))-1);
        
     
        if (c1) printf("Less than 8 characters\n");
        if (c2) printf("Uppercase letter missing\n");
        if (c3) printf("Lowercase letter missing\n");
        if (c4) printf("Alphabet from row 1 is missing\n");
        if (c5) printf("Alphabet from row 2 is missing\n");
        if (c6) printf("Alphabet from row 3 is missing\n");
        if (c7) printf("Number is missing\n");
        if (c8) printf("Special Character is missing\n");

        c = c1+c2+c3+c4+c5+c6+c7+c8;
    } while(c != 0);
    printf("Password Accepted\n");
}

int is_char_present(char pass[], int len_pass, char list[], int len_list) {
    for (int i=0; i<len_list; i++) {
        for (int j=0; j<len_pass; j++) {
            if (list[i] == pass[j]) return 0;
        }
    }
    return 1;
}

void company_register() {

    strcat(register_company, company_name);
    _mkdir(register_company);

    char dummy_reg_comp[100];
    strcpy(dummy_reg_comp, register_company);

    FILE *fptr;

    strcat(dummy_reg_comp, "/info.txt");
    fptr = fopen(dummy_reg_comp, "a");

    fprintf(fptr, "%s", "Name: ");
    fprintf(fptr, "%s", company_name);
    fputc('\n',fptr);
    fprintf(fptr, "%s", "Country: ");
    fprintf(fptr, "%s", country);
    fputc('\n',fptr);
    
    fclose(fptr);


    strcpy(dummy_reg_comp, register_company);
    strcat(dummy_reg_comp, "/admin.txt");
    fptr = fopen(dummy_reg_comp, "w");
    fclose(fptr);


    strcpy(dummy_reg_comp, register_company);
    strcat(dummy_reg_comp, "/manager.txt");
    fptr = fopen(dummy_reg_comp, "w");
    fclose(fptr);


    strcpy(dummy_reg_comp, register_company);
    strcat(dummy_reg_comp, "/employee.txt");
    fptr = fopen(dummy_reg_comp, "w");
    fclose(fptr);


    strcpy(dummy_reg_comp, register_company);
    strcat(dummy_reg_comp, "/expenses.txt");
    fptr = fopen(dummy_reg_comp, "a");
    fclose(fptr);


    fptr = fopen("files/login_cred.txt","a");
    fprintf(fptr, "%s", email);
    fputc('\t', fptr);
    fprintf(fptr, "%s", password);
    fputc('\t', fptr);
    fprintf(fptr, "%s", "admin");
    fputc('\n', fptr);
    fclose(fptr);


    fptr = fopen(company_list_file,"a");
    fprintf(fptr, "%s\n", company_name);
    fclose(fptr);

    strcpy(register_company, "");
    printf("%s", register_company);
    strcpy(register_company, "files/Company/");
}

void user_input() {
    printf("Enter your E-mail address: ");
    scanf(" %[^\n]", email);

    printf("Enter your Password: ");
    scanf(" %[^\n]", password);
}

int user_login_check() {
    int status=0;
    FILE *fptr;

    fptr = fopen(login_creds, "r");
    rewind(fptr);
    
    char email1[100], password1[100];

    while(fscanf(fptr, "%s %s %s", email1, password1, position) == 3) {
        printf("\n%s %s\n", email1, password1);
        if (strcmp(email1, email) == 0) {
            if (strcmp(password1, password) == 0) {
                status++; 
                break;
            }
        }
    }

    fclose(fptr);
    return status;
}

void login_output(int status) {
    if (status == 1) {
        printf("E-mail & Password are correct.\nLogin Successful!!\n");
    }

    else {
        printf("Incorrect E-mail and Password.\nTry Again.\n");
    }
}